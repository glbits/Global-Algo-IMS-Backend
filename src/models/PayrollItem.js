const mongoose = require('mongoose');

const PayrollItemSchema = new mongoose.Schema(
  {
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // ✅ Attendance (auto from IMS, but HR can override workingDays/attendanceDays like your sheet)
    attendance: {
      presentDays: { type: Number, default: 0 },
      lateDays: { type: Number, default: 0 },
      attendanceDays: { type: Number, default: 0 }, // present + paidLeave + halfDay (0.5)
      workingDays: { type: Number, default: 0 },    // days in month (or HR override)
      absentDays: { type: Number, default: 0 }      // workingDays - attendanceDays
    },

    // ✅ Manual fields (HR fills)
    manual: {
      designation: { type: String, default: '' },
      basicSalary: { type: Number, default: 0 },
      incentive: { type: Number, default: 0 },
      deduction: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      remarks: { type: String, default: '' }
    },

    // ✅ Auto calculated
    grossSalary: { type: Number, default: 0 }, // basic * attendanceDays / workingDays
    netPay: { type: Number, default: 0 },      // gross + incentive + allowances - deduction

    payslipNumber: { type: String, required: true }
  },
  { timestamps: true }
);

PayrollItemSchema.index({ payrollRun: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PayrollItem', PayrollItemSchema);
