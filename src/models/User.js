const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: [
        'Admin',
        'LeadManager',     // ✅ ADDED
        'BranchManager',
        'HR',
        'TeamLead',
        'Employee'
      ],
      required: true
    },

    reportsTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    branch: {
      type: String,
      default: ''
    },

    salary: {
      basic: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      deductions: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', UserSchema);
