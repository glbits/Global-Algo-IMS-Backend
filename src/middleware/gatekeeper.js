const Attendance = require('../models/Attendance');
const CalendarEvent = require('../models/CalendarEvent');
const { getTodayDateString } = require('../utils/dateUtils');

const gatekeeper = async (req, res, next) => {
  try {
    const role = req.user.role;
    
    // 1. IMMUNITY: Management never blocked
    if (['Admin', 'BranchManager', 'LeadManager', 'HR'].includes(role)) {
      return next();
    }

    const today = getTodayDateString(); // IST Safe

    // 2. HOLIDAY CHECK (Active Global Holidays allow access)
    // Only fetch if NOT deleted by HR
    const holiday = await CalendarEvent.findOne({ 
      date: today, 
      type: 'Holiday', 
      isDeletedByHR: { $ne: true } 
    });

    if (holiday) {
      return next(); // Holiday = Floor Open
    }

    // 3. ATTENDANCE CHECK
    const record = await Attendance.findOne({ 
      user: req.user.id, 
      date: today 
    });

    // 4. CHECK STATUS
    if (!record) {
      return res.status(403).json({ 
        msg: "ACCESS DENIED: You must clock in to access data." 
      });
    }

    // Allow if HR marked leave or if user is Online/On-call
    const allowedStatuses = ['Online', 'On-call', 'Break', 'Lunch Time', 'Evaluation', 'Paid Leave', 'Half Day'];
    
    if (allowedStatuses.includes(record.currentStatus)) {
        return next();
    }

    return res.status(403).json({ msg: "You are currently Offline. Please switch to Online." });

  } catch (err) {
    console.error("Gatekeeper Error:", err);
    res.status(500).json({ msg: "Security Gatekeeper Failure" });
  }
};

module.exports = gatekeeper;