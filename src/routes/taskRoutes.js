const express = require('express');
const router = express.Router();
const { createTask, getTasks, completeTask } = require('../controllers/taskController');
const auth = require('../middleware/auth');
const denyRoles = require('../middleware/denyRoles');

// Task List should NOT be accessible to LeadManager
router.post('/create', auth, denyRoles('LeadManager'), createTask);
router.get('/', auth, denyRoles('LeadManager'), getTasks);
router.put('/:id/complete', auth, denyRoles('LeadManager'), completeTask);

module.exports = router;
