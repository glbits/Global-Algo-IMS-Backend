const Task = require('../models/Task');
const User = require('../models/User');

// 1. CREATE MANUAL TASK
exports.createTask = async (req, res) => {
  try {
    const { title, description, assignedTo, priority, dueDate } = req.body;
    
    // Validation: Ensure assignedTo exists
    const targetUser = await User.findById(assignedTo);
    if (!targetUser) return res.status(404).json({ msg: "Target user not found" });

    const newTask = new Task({
      title,
      description,
      assignedBy: req.user.id,
      assignedTo,
      priority,
      dueDate: dueDate || new Date(),
      type: 'Manual'
    });

    await newTask.save();
    res.json({ msg: "Task Assigned Successfully" });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

// 2. GET MY TASKS (Inbox & Outbox)
exports.getTasks = async (req, res) => {
  try {
    const userId = req.user.id;

    // Tasks I need to DO
    const myInbox = await Task.find({ assignedTo: userId, status: 'Pending' })
      .populate('assignedBy', 'name role')
      .populate('relatedLead', 'phoneNumber name') // If it's a callback
      .sort({ dueDate: 1 }); // Urgent first

    // Tasks I assigned to OTHERS (Managers only)
    const myOutbox = await Task.find({ assignedBy: userId, assignedTo: { $ne: userId } })
      .populate('assignedTo', 'name role')
      .sort({ createdAt: -1 });

    res.json({ inbox: myInbox, outbox: myOutbox });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

// 3. COMPLETE TASK
exports.completeTask = async (req, res) => {
  try {
    await Task.findByIdAndUpdate(req.params.id, { status: 'Completed' });
    res.json({ msg: "Task Completed" });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};