  const mongoose = require('mongoose');

  const AttendanceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, 

    currentStatus: { 
      type: String, 
      enum: ['Online', 'Offline', 'On-call', 'Break', 'Evaluation', 'Lunch Time'], 
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

    // NEW: Shift Compliance Data
    loginTime: Date,
    scheduledLogout: Date, // The calculated time they SHOULD leave
    isLate: { type: Boolean, default: false },
    lateBy: { type: Number, default: 0 }, // Minutes late

    history: [{
      status: String,
      startTime: Date,
      endTime: Date,
      durationMinutes: Number
    }]
  });

  AttendanceSchema.index({ user: 1, date: 1 }, { unique: true });

  module.exports = mongoose.model('Attendance', AttendanceSchema);