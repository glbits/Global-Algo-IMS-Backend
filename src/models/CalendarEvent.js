const mongoose = require('mongoose');

const CalendarEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  // Canonical Date String: YYYY-MM-DD
  date: { type: String, required: true, index: true }, 
  
  type: { 
    type: String, 
    enum: ['Holiday', 'Company Event', 'Training', 'Meeting'], 
    default: 'Holiday' 
  },
  
  isGlobal: { type: Boolean, default: false }, // True = System/API Sync
  isDeletedByHR: { type: Boolean, default: false }, // Soft delete for global holidays
  
  description: { type: String },
  
  // Track who manually added this (if not system)
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Prevent duplicate global holidays for the same date
CalendarEventSchema.index({ date: 1, title: 1, isGlobal: 1 }, { unique: true });

module.exports = mongoose.model('CalendarEvent', CalendarEventSchema);