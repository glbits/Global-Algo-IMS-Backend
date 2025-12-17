const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  
  // Hierarchy Logic
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // To distinguish between Boss's orders and System Reminders
  type: { 
    type: String, 
    enum: ['Manual', 'System-Callback', 'System-Followup'], 
    default: 'Manual' 
  },
  
  // Link to Lead (if it's a callback)
  relatedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
  dueDate: { type: Date, default: Date.now }

}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);