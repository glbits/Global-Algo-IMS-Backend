const express = require('express');
const router = express.Router();
const { createTicket, getTickets, resolveTicket } = require('../controllers/ticketController');
const auth = require('../middleware/auth');
const denyRoles = require('../middleware/denyRoles');

// Support Desk should NOT be accessible to LeadManager
router.post('/create', auth, denyRoles('LeadManager'), createTicket);
router.get('/', auth, denyRoles('LeadManager'), getTickets);
router.put('/:id/resolve', auth, denyRoles('LeadManager'), resolveTicket);

module.exports = router;
