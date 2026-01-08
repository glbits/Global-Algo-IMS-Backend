const mongoose = require('mongoose');

const PayrollRunSchema = new mongoose.Schema(
  {
    period: {
      month: { type: Number, required: true, min: 1, max: 12 },
      year: { type: Number, required: true }
    },
    status: { type: String, enum: ['Draft', 'Finalized'], default: 'Draft' },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

PayrollRunSchema.index({ 'period.month': 1, 'period.year': 1 }, { unique: false });

module.exports = mongoose.model('PayrollRun', PayrollRunSchema);
