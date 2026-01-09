const express = require('express');
const router = express.Router();
const { 
  getEvents, 
  addEvent, 
  deleteEvent, 
  syncIndianHolidays // <--- Make sure this is imported
} = require('../controllers/calendarController');
const auth = require('../middleware/auth');

// 1. Get Events (Public for staff)
router.get('/events', auth, getEvents);

// 2. Add Event (HR Manual)
router.post('/events', auth, addEvent);

// 3. Bulk Sync (The missing link causing the 404)
router.post('/bulk-sync', auth, syncIndianHolidays); 

// 4. Delete Event
router.delete('/events/:id', auth, deleteEvent);

module.exports = router;