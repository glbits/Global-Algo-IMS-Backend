const mongoose = require('mongoose');

const PayrollItemSchema = new mongoose.Schema(
  {
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // ✅ Attendance from IMS only (auto)
    attendance: {
      presentDays: { type: Number, default: 0 },
      lateDays: { type: Number, default: 0 }
    },

    // ✅ Everything else is manual (HR fills)
    manual: {
      basicSalary: { type: Number, default: 0 },
      incentive: { type: Number, default: 0 },
      deduction: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      remarks: { type: String, default: '' }
    },

    // ✅ netPay auto calculated from manual fields (HR doesn't type net pay)
    netPay: { type: Number, default: 0 },

    payslipNumber: { type: String, required: true }
  },
  { timestamps: true }
);

PayrollItemSchema.index({ payrollRun: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PayrollItem', PayrollItemSchema);
