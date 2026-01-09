const Attendance = require('../models/Attendance');
const CalendarEvent = require('../models/CalendarEvent');

const gatekeeper = async (req, res, next) => {
  try {
    const role = req.user.role;
    
    // 1. IMMUNITY: Management roles never blocked
    if (['Admin', 'BranchManager', 'LeadManager', 'HR'].includes(role)) {
      return next();
    }

    const today = new Date().toISOString().split('T')[0];

    // 2. CORNER CASE: Check if Today is a Global Holiday
    const holiday = await CalendarEvent.findOne({ 
      date: today, 
      type: 'Holiday', 
      isDeletedByHR: false 
    });

    if (holiday) {
      // It's a holiday! Allow access even if not clocked in.
      return next();
    }

    // 3. CHECK ATTENDANCE: Clock-in or HR-marked Leave
    const record = await Attendance.findOne({ 
      user: req.user.id, 
      date: today 
    });

    if (!record) {
      return res.status(403).json({ 
        msg: "ACCESS DENIED: You must clock in to access data." 
      });
    }

    // 4. CORNER CASE: If marked as Paid Leave or Half Day by HR
    if (['Paid Leave', 'Half Day'].includes(record.currentStatus)) {
      return next();
    }

    // 5. STANDARD CASE: User is clocked in (Online, On-call, etc.)
    if (record.currentStatus === 'Offline') {
        return res.status(403).json({ msg: "You are currently Offline. Please switch to Online." });
    }

    next();
  } catch (err) {
    res.status(500).json({ msg: "Gatekeeper Security Error" });
  }
};

module.exports = gatekeeper;