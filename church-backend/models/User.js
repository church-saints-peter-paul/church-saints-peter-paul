const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: [true, 'الاسم الأول مطلوب'],
        trim: true,
        maxlength: [50, 'الاسم الأول لا يمكن أن يزيد عن 50 حرف']
    },
    lastName: {
        type: String,
        required: [true, 'الاسم الأخير مطلوب'],
        trim: true,
        maxlength: [50, 'الاسم الأخير لا يمكن أن يزيد عن 50 حرف']
    },
    username: {
        type: String,
        required: [true, 'اسم المستخدم مطلوب'],
        unique: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل']
    },
    email: {
        type: String,
        required: [true, 'البريد الإلكتروني مطلوب'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'يرجى إدخال بريد إلكتروني صالح']
    },
    phone: {
        type: String,
        required: [true, 'رقم الهاتف مطلوب'],
        match: [/^\+20[0-9]{10}$/, 'رقم الهاتف يجب أن يبدأ بـ +20 ويحتوي على 10 أرقام']
    },
    passwordHash: {
        type: String,
        required: [true, 'كلمة المرور مطلوبة']
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    registrationDate: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    ipAddress: {
        type: String,
        default: 'Unknown'
    },
    userAgent: {
        type: String,
        default: 'Unknown'
    },
    verified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for faster queries
userSchema.index({ email: 1 });
userSchema.index({ registrationDate: -1 });
userSchema.index({ firstName: 1, lastName: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;