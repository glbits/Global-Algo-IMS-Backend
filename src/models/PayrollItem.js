const mongoose = require('mongoose');

const PayrollItemSchema = new mongoose.Schema(
  {
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    attendance: {
      presentDays: { type: Number, default: 0 },
      lateDays: { type: Number, default: 0 }
    },

    earnings: {
      basic: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 }
    },
    deductions: {
      fixed: { type: Number, default: 0 },
      attendancePenalty: { type: Number, default: 0 }
    },

    netPay: { type: Number, default: 0 },
    payslipNumber: { type: String, required: true }
  },
  { timestamps: true }
);

PayrollItemSchema.index({ payrollRun: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PayrollItem', PayrollItemSchema);
