const mongoose = require('mongoose');

// Leave Requests are the source of truth for the "leave system".
// When HR approves a request, the backend upserts Attendance rows for each
// requested date so that Attendance Calendar / payroll uses the same data.

const LeaveRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Canonical date strings (YYYY-MM-DD)
    startDate: { type: String, required: true, index: true },
    endDate: { type: String, required: true, index: true },

    type: {
      type: String,
      enum: ['Paid Leave', 'Half Day'],
      default: 'Paid Leave'
    },

    reason: { type: String, default: '' },

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
      index: true
    },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decisionRemarks: { type: String, default: '' },
    decidedAt: { type: Date }
  },
  { timestamps: true }
);

// Fast lookups for an employee's leaves in a date range
LeaveRequestSchema.index({ user: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema);
