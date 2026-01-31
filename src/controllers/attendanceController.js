const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { getISTDate, getTodayDateString } = require('../utils/dateUtils');

// 1. TOGGLE STATUS (Employee Clock-In)
exports.updateStatus = async (req, res) => {
  const { newStatus } = req.body;
  const userId = req.user.id;
  const today = getTodayDateString(); // IST SAFE
  const now = new Date();

  // --- 1. SHIFT RULES (Check on FIRST Online) ---
  if (newStatus === 'Online') {
    const istNow = getISTDate();
    const currentHour = istNow.getHours();
    const currentMin = istNow.getMinutes();
    const totalMinutes = currentHour * 60 + currentMin;

    // Rule: BLOCK before 9:00 AM (540 mins)
    if (totalMinutes < 540) {
      const exists = await Attendance.findOne({ user: userId, date: today });
      if (!exists) {
        return res.status(400).json({ msg: "Shift starts at 9:00 AM. Please wait." });
      }
    }
  }

  try {
    let attendance = await Attendance.findOne({ user: userId, date: today });

    // --- SCENARIO A: FIRST CLOCK IN ---
    if (!attendance) {
      if (newStatus !== 'Online') {
        return res.status(400).json({ msg: "You must start the day by marking 'Online'." });
      }

      // Calculate Late/Logout logic using IST time
      const istNow = getISTDate();
      const actualStart = istNow.getHours() * 60 + istNow.getMinutes();
      const startBenchmark = 9 * 60 + 30; // 9:30 AM

      let isLate = false;
      let lateBy = 0;
      
      // Calculate Logout in actual Date object (server time)
      let scheduledLogout = new Date(now);

      if (actualStart > startBenchmark) {
        isLate = true;
        lateBy = actualStart - startBenchmark;
      }

      if (actualStart <= startBenchmark) {
        scheduledLogout.setHours(scheduledLogout.getHours() + 8);
      } else {
        scheduledLogout.setHours(17, 30, 0, 0); // 5:30 PM Hard Stop
      }

      attendance = new Attendance({
        user: userId,
        date: today,
        currentStatus: newStatus,
        lastStatusChange: now,
        loginTime: now,
        scheduledLogout: scheduledLogout,
        isLate,
        lateBy,
        history: [{ status: newStatus, startTime: now, actionBy: userId, details: 'Self Login' }]
      });

      await attendance.save();
      return res.json({
        msg: isLate ? `Clocked In (Late by ${lateBy} mins)` : "Clocked In Successfully",
        currentStatus: newStatus,
        durations: attendance.durations
      });
    }

    // --- SCENARIO B: STATUS SWITCH ---
    const oldStatus = attendance.currentStatus;
    if (oldStatus === newStatus) return res.json({ msg: `Already ${newStatus}` });

    // Calculate duration of previous status
    const lastChange = new Date(attendance.lastStatusChange);
    const diffSeconds = Math.floor((now - lastChange) / 1000);

    attendance.durations[oldStatus] = (attendance.durations[oldStatus] || 0) + diffSeconds;

    // Update history
    if (attendance.history.length > 0) {
      const lastEntry = attendance.history[attendance.history.length - 1];
      lastEntry.endTime = now;
      lastEntry.durationMinutes = parseFloat((diffSeconds / 60).toFixed(2));
    }
    
    attendance.history.push({ 
      status: newStatus, 
      startTime: now, 
      actionBy: userId, 
      details: 'Status Switch' 
    });

    attendance.currentStatus = newStatus;
    attendance.lastStatusChange = now;

    await attendance.save();

    res.json({
      msg: `Switched to ${newStatus}`,
      currentStatus: newStatus,
      durations: attendance.durations
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// 2. GET LIVE STATUS
exports.getStatus = async (req, res) => {
  try {
    const today = getTodayDateString(); // IST SAFE
    const attendance = await Attendance.findOne({ user: req.user.id, date: today });

    if (!attendance) return res.json({ currentStatus: 'Offline', durations: {} });

    // Calculate Live Seconds
    const now = new Date();
    const activeDiffMs = now - new Date(attendance.lastStatusChange);
    const activeSeconds = Math.floor(activeDiffMs / 1000);

    const liveDurations = { ...attendance.durations };
    // Only add live time if NOT in a static HR state (Paid Leave/Half Day do not accrue seconds)
    if (!['Paid Leave', 'Half Day'].includes(attendance.currentStatus)) {
        const storedTotal = liveDurations[attendance.currentStatus] || 0;
        liveDurations[attendance.currentStatus] = storedTotal + activeSeconds;
    }

    res.json({
      currentStatus: attendance.currentStatus,
      durations: liveDurations,
      scheduledLogout: attendance.scheduledLogout
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

// 3. GET CALENDAR DATA
exports.getCalendarData = async (req, res) => {
  try {
    const { month, year, targetUserId } = req.query;
    let queryId = req.user.id;

    // RBAC: Check if user is allowed to view others
    if (targetUserId && targetUserId !== req.user.id) {
      const elevatedRoles = ['Admin', 'BranchManager', 'HR', 'TeamLead'];
      if (elevatedRoles.includes(req.user.role)) {
         queryId = targetUserId;
      } else {
         return res.status(403).json({ msg: 'Forbidden' });
      }
    }

    const formattedMonth = String(month).padStart(2, '0');
    const regex = new RegExp(`^${year}-${formattedMonth}-`);

    const records = await Attendance.find({
      user: queryId,
      date: { $regex: regex }
    });

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// 4. HR MARK ATTENDANCE (Audit-Safe)
exports.hrMarkAttendance = async (req, res) => {
  const { userId, date, status, remarks } = req.body; 
  const actorId = req.user.id;

  // Validation
  if (!['Paid Leave', 'Half Day'].includes(status)) {
    return res.status(400).json({ msg: "Invalid Status. Use 'Paid Leave' or 'Half Day'." });
  }

  try {
    // Upsert the attendance record
    const record = await Attendance.findOneAndUpdate(
      { user: userId, date: date },
      { 
        currentStatus: status,
        // Reset calculations if overriding
        isLate: false, 
        lateBy: 0,
        $push: { history: { 
            status: status, 
            startTime: new Date(),
            actionBy: actorId, 
            details: `Marked by HR: ${remarks || 'No remarks'}`, 
        }}
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ msg: `Success: Marked ${status}`, record });
  } catch (err) {
    console.error(err);
    res.status(500).send("HR Action Failed");
  }
};
