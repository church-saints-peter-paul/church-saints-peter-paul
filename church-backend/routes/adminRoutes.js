const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const LoginLog = require('../models/LoginLog');

// @desc    Get all login logs
// @route   GET /api/admin/logs
// @access  Private/Admin
router.get('/logs', protect, authorize('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50, status, search } = req.query;
        const query = {};

        if (status) query.status = status;
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } }
            ];
        }

        const logs = await LoginLog.find(query)
            .sort({ loginTime: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await LoginLog.countDocuments(query);

        res.json({ success: true, count: logs.length, total, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في جلب السجلات' });
    }
});

module.exports = router;
