const Attendance = require('../models/Attendance');

const gatekeeper = async (req, res, next) => {
  try {
    // 1. IMMUNITY: Admin AND BranchManager do NOT need attendance
    if (req.user.role === 'Admin' || req.user.role === 'BranchManager') {
      return next();
    }

    // 2. Define "Today"
    const today = new Date().toISOString().split('T')[0];

    // 3. Check DB for everyone else (TeamLead, Employee)
    const record = await Attendance.findOne({ 
      user: req.user.id, 
      date: today 
    });

    if (!record) {
      return res.status(403).json({ 
        msg: "ACCESS DENIED: You must clock in to access data." 
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ msg: "Gatekeeper Error" });
  }
};

module.exports = gatekeeper;