const Attendance = require('../models/Attendance');
const User = require('../models/User');
// Removed rbac import if not used, or keep it if needed: 
// const { canManageTargetUser } = require('../middleware/rbac'); 

// 1. TOGGLE STATUS (Auto-Clock In + Precision Timer)
exports.updateStatus = async (req, res) => {
  const { newStatus } = req.body;
  const userId = req.user.id;
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  // --- 1. SHIFT RULES (Only check on FIRST Login of the day) ---
  if (newStatus === 'Online') {
    const currentHour = now.getHours();   // e.g. 9
    const currentMin = now.getMinutes();  // e.g. 30
    const totalMinutes = currentHour * 60 + currentMin; // Convert to minutes for easy math

    // Rule A: BLOCK before 9:00 AM (9*60 = 540)
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

      // CALCULATE LATENESS & LOGOUT TIME
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const startBenchmark = 9 * 60 + 30; // 570
      const actualStart = currentHour * 60 + currentMin;

      let isLate = false;
      let lateBy = 0;
      let scheduledLogout = new Date(now);

      if (actualStart > startBenchmark) {
        isLate = true;
        lateBy = actualStart - startBenchmark; 
      }

      if (actualStart <= startBenchmark) {
        scheduledLogout.setHours(scheduledLogout.getHours() + 8);
      } else {
        scheduledLogout.setHours(17, 30, 0, 0); 
      }

      attendance = new Attendance({
        user: userId,
        date: today,
        currentStatus: newStatus,
        lastStatusChange: now,
        loginTime: now,
        scheduledLogout: scheduledLogout,
        isLate: isLate,
        lateBy: lateBy,
        durations: { Offline: 0, Online: 0, 'On-call': 0, Break: 0, 'Lunch Time': 0, Evaluation: 0 },
        history: [{ status: newStatus, startTime: now }]
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

    const lastChange = new Date(attendance.lastStatusChange);
    const diffSeconds = Math.floor((now - lastChange) / 1000);

    attendance.durations[oldStatus] = (attendance.durations[oldStatus] || 0) + diffSeconds;

    if (attendance.history.length > 0) {
      const lastEntry = attendance.history[attendance.history.length - 1];
      lastEntry.endTime = now;
      lastEntry.durationMinutes = (diffSeconds / 60).toFixed(2);
    }
    attendance.history.push({ status: newStatus, startTime: now });

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
    const today = new Date().toISOString().split('T')[0];
    const attendance = await Attendance.findOne({ user: req.user.id, date: today });

    if (!attendance) return res.json({ currentStatus: 'Offline', durations: {} });

    const now = new Date();
    const activeDiffMs = now - new Date(attendance.lastStatusChange);
    const activeSeconds = Math.floor(activeDiffMs / 1000);

    const liveDurations = { ...attendance.durations };
    const storedTotal = liveDurations[attendance.currentStatus] || 0;
    liveDurations[attendance.currentStatus] = storedTotal + activeSeconds;

    res.json({
      currentStatus: attendance.currentStatus,
      durations: liveDurations,
      scheduledLogout: attendance.scheduledLogout 
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

// 3. GET MONTHLY CALENDAR DATA
exports.getCalendarData = async (req, res) => {
  try {
    const { month, year, targetUserId } = req.query;

    let queryId = req.user.id;

    // If requesting someone else's calendar (Admin/Manager Feature)
    if (targetUserId && targetUserId !== req.user.id) {
      const elevated = ['Admin', 'BranchManager', 'HR', 'TeamLead'];
      if (elevated.includes(req.user.role)) {
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

// 4. HR MARK ATTENDANCE (Added by you)
exports.hrMarkAttendance = async (req, res) => {
  const { userId, date, status, remarks } = req.body; 

  try {
    const record = await Attendance.findOneAndUpdate(
      { user: userId, date: date },
      { 
        currentStatus: status,
        $push: { history: { 
            status: status, 
            details: `Marked by HR: ${remarks}`, 
            date: new Date() 
        }}
      },
      { upsert: true, new: true }
    );

    res.json({ msg: `Employee marked as ${status}`, record });
  } catch (err) {
    res.status(500).send("HR Action Failed");
  }
};