// const mongoose = require('mongoose');

// const UserSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   email: { type: String, required: true, unique: true },
//   password: { type: String, required: true }, // Will store hashed password
//   role: { 
//     type: String, 
//     enum: ['Admin','LeadManager', 'BranchManager', 'TeamLead', 'Employee'], 
//     default: 'Employee' 
//   },
//   // The Hierarchy Link: Who manages this user?
//   reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
// });

// module.exports = mongoose.model('User', UserSchema);

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Will store hashed password

  role: {
    type: String,
    enum: ['Admin', 'BranchManager', 'HR', 'TeamLead', 'Employee'],
    default: 'Employee'
  },

  // Optional grouping (recommended). If you don't use branches, you can ignore this.
  branch: { type: String, default: '' },

  // Payroll (simple structure; extend as needed)
  salary: {
    basic: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 }
  },

  // The Hierarchy Link: Who manages this user?
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

module.exports = mongoose.model('User', UserSchema);
