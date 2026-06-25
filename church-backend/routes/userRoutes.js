const express = require('express');
const router = express.Router();
const {
    registerUser,
    getAllUsers,
    getUserStats,
    deleteUser,
    exportToCSV
} = require('../controllers/userController');

// Public routes
router.post('/register', registerUser);

// Admin routes (require password)
router.get('/', getAllUsers);
router.get('/stats', getUserStats);
router.get('/export/csv', exportToCSV);
router.delete('/:id', deleteUser);

module.exports = router;