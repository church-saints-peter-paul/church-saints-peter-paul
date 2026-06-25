const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// --- 1. MIDDLEWARES & SECURITY HEADERS ---
app.use(helmet()); // Set secure HTTP headers
app.use(hpp());    // Prevent HTTP parameter pollution

// Dynamic CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
            return callback(null, true);
        } else {
            return callback(new Error('CORS Policy: Request origin blocked.'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting (Brute-Force & DDOS protection)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: {
        success: false,
        message: 'لقد تجاوزت حد الطلبات المسموح به. يرجى المحاولة لاحقاً.'
    }
});
app.use('/api/', limiter);

// --- 2. SUPABASE INITIALIZATION ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Critical Error: SUPABASE_URL or SUPABASE_ANON_KEY is missing in environmental variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('⚡ Backend Connected to Supabase Gateway.');

// --- 3. SERVER ROUTING ---

// Middleware to authenticate Supabase JWT on backend API endpoints
async function authenticateSupabaseToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'عذراً، لم يتم توفير رمز مصادقة صالح.' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ success: false, message: 'مصادقة غير صالحة أو منتهية الصلاحية.' });
        }
        
        req.user = user;
        next();
    } catch (err) {
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء فحص المصادقة.' });
    }
}

// Health Check API
app.get('/health', async (req, res) => {
    try {
        // Query to check Supabase connection health
        const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true }).limit(1);
        if (error) throw error;
        
        res.json({
            status: 'UP',
            message: 'خادم كنيسة القديسين بطرس وبولس يعمل بنجاح',
            database: 'Supabase Connected',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            status: 'DOWN',
            message: 'الخادم متوقف بسبب فشل الاتصال بقاعدة البيانات',
            error: err.message
        });
    }
});

// Sample Protected API route
app.get('/api/user/profile', authenticateSupabaseToken, async (req, res) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        res.json({ success: true, profile });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل جلب ملف العضوية.', error: err.message });
    }
});

// --- 4. ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع في الخادم',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// --- 5. SERVER LAUNCH ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Node server running on port ${PORT}`);
    console.log(`📡 Health Check URL: http://localhost:${PORT}/health`);
});