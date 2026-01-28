const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');
const leave = require('../controllers/leaveController');

// Employee endpoints
router.post('/', auth, leave.createLeaveRequest);
router.get('/mine', auth, leave.getMyLeaves);
router.post('/:id/cancel', auth, leave.cancelMyLeave);

// HR endpoints
router.get('/hr/employees', auth, authorizeRoles('HR'), leave.hrListEmployees);
router.get('/hr', auth, authorizeRoles('HR'), leave.hrListLeaves);
router.post('/hr/:id/decide', auth, authorizeRoles('HR'), leave.hrDecideLeave);

module.exports = router;
