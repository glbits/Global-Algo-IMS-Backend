const express = require('express');
const router = express.Router();
const { login, registerUser,getMySubordinates,getAllUsers } = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/login', login);
// Protected Route: Only logged-in users can create subordinates
router.post('/register', auth, registerUser);


router.get('/subordinates', auth, getMySubordinates);
router.get('/all-users', auth, getAllUsers);

module.exports = router;