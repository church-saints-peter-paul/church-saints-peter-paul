const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Can be null for failed attempts with non-existent users
    },
    fullName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: false
    },
    ipAddress: {
        type: String,
        required: true
    },
    country: {
        type: String,
        default: 'Unknown'
    },
    userAgent: {
        type: String,
        required: true
    },
    deviceInfo: {
        browser: String,
        os: String,
        device: String
    },
    status: {
        type: String,
        enum: ['success', 'failed'],
        required: true
    },
    failureReason: {
        type: String,
        required: false
    },
    loginTime: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for performance
loginLogSchema.index({ loginTime: -1 });
loginLogSchema.index({ status: 1 });
loginLogSchema.index({ email: 1 });

const LoginLog = mongoose.model('LoginLog', loginLogSchema);

module.exports = LoginLog;
