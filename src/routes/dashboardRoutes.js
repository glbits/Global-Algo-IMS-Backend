const express = require('express');
const router = express.Router();
const { getManagerDashboard } = require('../controllers/dashboardController');
const auth = require('../middleware/auth');

router.get('/manager-stats', auth, getManagerDashboard);

module.exports = router;