const express = require('express');
const router = express.Router();
const {
  getEvents,
  addEvent,
  deleteEvent,
  syncIndianHolidays // <--- Make sure this is imported
} = require('../controllers/calendarController');
const auth = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// 1. Get Events (Public for staff)
router.get('/events', auth, getEvents);

// 2. Add Event (ONLY HR)
router.post('/events', auth, authorizeRoles('HR'), addEvent);

// 3. Bulk Sync (ONLY HR)
router.post('/bulk-sync', auth, authorizeRoles('HR'), syncIndianHolidays);

// 4. Delete Event (ONLY HR)
router.delete('/events/:id', auth, authorizeRoles('HR'), deleteEvent);

module.exports = router;
