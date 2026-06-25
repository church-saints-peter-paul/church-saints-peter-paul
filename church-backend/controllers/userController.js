const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const geoip = require('geoip-lite');

// Helper to get geolocation and device info
const getSessionInfo = (req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const geo = geoip.lookup(ip);
    const country = geo ? geo.country : 'Unknown';

    // Simple device parsing
    let deviceType = 'Desktop';
    if (/Mobile|Android|iPhone/i.test(userAgent)) deviceType = 'Mobile';
    if (/Tablet|iPad/i.test(userAgent)) deviceType = 'Tablet';

    return { ip, country, userAgent, deviceType };
};

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
exports.registerUser = async (req, res) => {
    try {
        const { firstName, lastName, username, email, phone, password } = req.body;

        // 1. Validation
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'يرجى إكمال جميع البيانات' });
        }

        // 2. Check if exists
        const emailExists = await User.findOne({ email: email.toLowerCase() });
        if (emailExists) return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل بالفعل' });

        const userExists = await User.findOne({ username: username.toLowerCase() });
        if (userExists) return res.status(400).json({ success: false, message: 'اسم المستخدم مأخوذ' });

        // 3. Hash Password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const { ip, userAgent } = getSessionInfo(req);

        // 4. Create User
        const user = new User({
            firstName,
            lastName,
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            phone,
            passwordHash,
            ipAddress: ip,
            userAgent
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: { id: user._id, username: user.username, role: user.role }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر أثناء التسجيل' });
    }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
exports.loginUser = async (req, res) => {
    const { emailOrUsername, password } = req.body;
    const { ip, country, userAgent, deviceType } = getSessionInfo(req);

    let user = null;
    let logData = {
        fullName: 'Unknown',
        email: 'Unknown',
        username: 'Unknown',
        ipAddress: ip,
        country,
        userAgent,
        deviceInfo: { device: deviceType },
        status: 'failed'
    };

    try {
        // 1. Find User
        user = await User.findOne({
            $or: [
                { email: emailOrUsername.toLowerCase() },
                { username: emailOrUsername.toLowerCase() }
            ]
        });

        if (!user) {
            logData.failureReason = 'User not found';
            logData.email = emailOrUsername;
            await new LoginLog(logData).save();
            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }

        logData.userId = user._id;
        logData.fullName = `${user.firstName} ${user.lastName}`;
        logData.email = user.email;
        logData.username = user.username;

        // 2. Check Password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            logData.failureReason = 'Invalid password';
            await new LoginLog(logData).save();
            // Emit fail event for real-time dashboard
            const io = req.app.get('io');
            if (io) io.emit('newLoginAttempt', { ...logData, loginTime: new Date() });

            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }

        // 3. Success Logic
        logData.status = 'success';
        const log = await new LoginLog(logData).save();

        // Update last login
        user.lastLogin = new Date();
        user.ipAddress = ip;
        await user.save();

        // 4. Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        // Emit success event for real-time dashboard
        const io = req.app.get('io');
        if (io) io.emit('newLoginAttempt', log);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر أثناء تسجيل الدخول' });
    }
};

// ... Existing admin functions updated for JWT/Security ...

exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = {};
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query).skip(skip).limit(parseInt(limit)).select('-passwordHash');
        const total = await User.countDocuments(query);

        res.json({ success: true, count: users.length, total, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في جلب المستخدمين' });
    }
};

exports.getUserStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeToday = await User.countDocuments({ lastLogin: { $gte: new Date().setHours(0, 0, 0, 0) } });

        res.json({ success: true, data: { totalUsers, activeToday } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في جلب الإحصائيات' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم الحذف بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في الحذف' });
    }
};

exports.exportToCSV = async (req, res) => {
    try {
        const users = await User.find().select('firstName lastName email phone role');
        let csv = 'First Name,Last Name,Email,Phone,Role\n';
        users.forEach(u => {
            csv += `${u.firstName},${u.lastName},${u.email},${u.phone},${u.role}\n`;
        });
        res.header('Content-Type', 'text/csv');
        res.attachment('users.csv').send(csv);
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في التصدير' });
    }
};
