const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD (IST)

  currentStatus: { 
    type: String, 
    enum: ['Online', 'Offline', 'On-call', 'Break', 'Evaluation', 'Lunch Time', 'Paid Leave', 'Half Day'], 
    default: 'Offline' 
  },
  
  lastStatusChange: { type: Date, default: Date.now },

  durations: {
    Online: { type: Number, default: 0 },
    'On-call': { type: Number, default: 0 },
    Break: { type: Number, default: 0 },
    'Lunch Time': { type: Number, default: 0 },
    Evaluation: { type: Number, default: 0 },
    Offline: { type: Number, default: 0 }
  },

  // Shift Logic
  loginTime: Date,
  scheduledLogout: Date,
  isLate: { type: Boolean, default: false },
  lateBy: { type: Number, default: 0 },

  // Audit Trail & History
  history: [{
    status: String,
    startTime: Date,
    endTime: Date,
    durationMinutes: Number,
    // Audit Fields for HR Actions
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who did this?
    details: String // Remarks
  }]
}, { timestamps: true });

// Ensure one record per user per day
AttendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);