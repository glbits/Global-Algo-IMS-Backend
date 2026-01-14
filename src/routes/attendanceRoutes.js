const express = require('express');
const router = express.Router();
const { updateStatus, getStatus, getCalendarData, hrMarkAttendance } = require('../controllers/attendanceController');
const auth = require('../middleware/auth');

// Standard Staff Routes
router.post('/status', auth, updateStatus);
router.get('/current', auth, getStatus);
router.get('/calendar', auth, getCalendarData);

// HR Only Route
// Note: You can add specific RBAC middleware here if you have it, 
// otherwise the controller logic handles logic or we assume 'auth' provides role.
router.post('/hr-mark', auth, hrMarkAttendance);

module.exports = router;