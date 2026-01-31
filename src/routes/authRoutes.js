const express = require('express');
const router = express.Router();

const {
  login,
  registerUser,
  getMySubordinates,
  getMyDownlineUsers,
  getAllUsers,
  deleteUser,
  getMe
} = require('../controllers/authController');

const auth = require('../middleware/auth');
const denyRoles = require('../middleware/denyRoles');

// Public
router.post('/login', login);

// Protected: Only logged-in users can create subordinates (LeadManager must NOT access Add Member)
router.post('/register', auth, denyRoles('LeadManager'), registerUser);

// Direct subordinates only
router.get('/subordinates', auth, getMySubordinates);

// All levels under you (Admin -> BranchManager -> TeamLead -> Employee)
router.get('/downline', auth, getMyDownlineUsers);

// For staff monitoring pages (Admin/BM/HR) - LeadManager excluded
router.get('/all-users', auth, denyRoles('LeadManager'), getAllUsers);

// Delete user - LeadManager excluded (and controller enforces Admin-only)
router.delete('/user/:id', auth, denyRoles('LeadManager'), deleteUser);

// My profile
router.get('/me', auth, getMe);

module.exports = router;
