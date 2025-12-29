const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Who is currently responsible?
  recipient: { 
    type: String, 
    enum: ['Admin', 'BranchManager'], 
    default: 'BranchManager' 
  },

  category: { 
    type: String, 
    enum: ['Complaint', 'IT Issue', 'Harassment', 'Suggestion', 'Other'], 
    default: 'Other' 
  },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  subject: { type: String, required: true },
  description: { type: String, required: true },
  
  status: { type: String, enum: ['Open', 'Resolved'], default: 'Open' },
  
  // NEW: Resolution Details (The "Input" you asked for)
  resolutionDetails: { type: String }, 
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedDate: { type: Date }

}, { timestamps: true });

module.exports = mongoose.model('Ticket', TicketSchema);