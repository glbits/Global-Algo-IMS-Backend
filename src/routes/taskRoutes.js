const express = require('express');
const router = express.Router();
const { createTask, getTasks, completeTask } = require('../controllers/taskController');
const auth = require('../middleware/auth');

router.post('/create', auth, createTask);
router.get('/', auth, getTasks);
router.put('/:id/complete', auth, completeTask);

module.exports = router;