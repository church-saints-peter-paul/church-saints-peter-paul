const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'غير مصرح لك بالوصول، يرجى تسجيل الدخول' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-passwordHash');
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'الجلسة انتهت، يرجى تسجيل الدخول مرة أخرى' });
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `الدور (${req.user.role}) غير مصرح له بالوصول لهذا المسار`
            });
        }
        next();
    };
};
