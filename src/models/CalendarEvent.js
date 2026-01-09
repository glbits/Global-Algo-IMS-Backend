const mongoose = require('mongoose');

const CalendarEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: String, required: true }, 
  type: { type: String, enum: ['Holiday', 'Event', 'Leave'], default: 'Holiday' },
  isGlobal: { type: Boolean, default: true },
  state: { type: String, default: 'National' }, // Handle regional holidays
  isDeletedByHR: { type: Boolean, default: false } // The "Remove" logic
});

module.exports = mongoose.model('CalendarEvent', CalendarEventSchema);