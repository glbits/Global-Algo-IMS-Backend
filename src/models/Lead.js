const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  name: { type: String }, 
  
  status: { 
    type: String, 
    // FIXED: Added 'Callback', 'Busy', 'Ringing' to the list
    enum: ['New', 'Contacted', 'Interested', 'Closed', 'Rejected', 'Archived', 'Callback', 'Busy', 'Ringing'], 
    default: 'New' 
  },

  // LEAD FORENSICS
  touchCount: { type: Number, default: 0 }, 
  isArchived: { type: Boolean, default: false }, 
  archiveReason: { type: String }, 

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadBatch' }, 
  
  // THE CHAIN OF CUSTODY
  custodyChain: [{
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedDate: { type: Date, default: Date.now },
    roleAtTime: String 
  }],

  // INTERACTIONS
  history: [{
    action: String, 
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now },
    outcome: String,
    details: String,
    duration: Number,
    messageSent: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('Lead', LeadSchema);