
const express = require('express');
const router = express.Router();

const {
  login,
  registerUser,
  getMySubordinates,
  getMyDownlineUsers,   // ✅ NEW (added)
  getAllUsers,
  deleteUser,
  getMe
} = require('../controllers/authController');

const auth = require('../middleware/auth');

router.post('/login', login);

// Protected Route: Only logged-in users can create subordinates
router.post('/register', auth, registerUser);

// Existing (direct subordinates only)
router.get('/subordinates', auth, getMySubordinates);

// ✅ NEW: All levels under you (Admin -> BranchManager -> TeamLead -> Employee)
router.get('/downline', auth, getMyDownlineUsers);

router.get('/all-users', auth, getAllUsers);

router.delete('/user/:id', auth, deleteUser);

router.get('/me', auth, getMe);

module.exports = router;
