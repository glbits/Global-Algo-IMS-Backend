const mongoose = require('mongoose');

const PayrollRunSchema = new mongoose.Schema(
  {
    period: {
      month: { type: Number, required: true }, // 1-12
      year: { type: Number, required: true }
    },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['Draft', 'Finalized'], default: 'Draft' }
  },
  { timestamps: true }
);

PayrollRunSchema.index({ 'period.month': 1, 'period.year': 1 });

module.exports = mongoose.model('PayrollRun', PayrollRunSchema);
