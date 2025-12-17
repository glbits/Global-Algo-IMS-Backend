const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Will store hashed password
  role: { 
    type: String, 
    enum: ['Admin', 'BranchManager', 'TeamLead', 'Employee'], 
    default: 'Employee' 
  },
  // The Hierarchy Link: Who manages this user?
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

module.exports = mongoose.model('User', UserSchema);