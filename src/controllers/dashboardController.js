const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Lead = require('../models/Lead');

exports.getManagerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const today = new Date().toISOString().split('T')[0];

    // --- 1. IDENTIFY TEAM (Who do I monitor?) ---
    let teamIds = [];
    
    // FIX 1: Include Admin in the stats too!
    if (role === 'Admin') {
      const allUsers = await User.find({}); // Fetch EVERYONE (including Admin)
      teamIds = allUsers.map(u => u._id);
    } else {
      // For Managers: Fetch direct reports + Self
      const directReports = await User.find({ reportsTo: userId });
      teamIds = directReports.map(u => u._id);
      teamIds.push(userId); // Add manager themselves
    }

    // --- 2. LIVE ATTENDANCE ---
    const attendanceRecords = await Attendance.find({ 
      user: { $in: teamIds }, 
      date: today 
    }).populate('user', 'name role');

    const attendanceSummary = {
      total: teamIds.length,
      present: attendanceRecords.length,
      late: attendanceRecords.filter(r => r.isLate).length,
      absent: teamIds.length - attendanceRecords.length,
      onCall: attendanceRecords.filter(r => r.currentStatus === 'On-call').map(r => r.user.name),
      online: attendanceRecords.filter(r => r.currentStatus === 'Online').length
    };

    // --- 3. LEAD VELOCITY (Assigned vs Contacted Today) ---
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);

    // A. DENOMINATOR: Leads Assigned/Given Today
    const leadsAssignedToday = await Lead.countDocuments({
      assignedTo: { $in: teamIds },
      // Logic: Count any lead currently held by the team that isn't Archived
      status: { $ne: 'Archived' } 
    });

    // B. NUMERATOR: Actual CALLS made Today (FIXED LOGIC)
    // We filter history elements to match ONLY 'Call Attempt' actions
    const leadsContactedToday = await Lead.countDocuments({
      "history.by": { $in: teamIds },
      "history.date": { $gte: startOfDay, $lte: endOfDay },
      // FIX 2: Only count records where action starts with "Call"
      "history.action": { $regex: /^Call/, $options: 'i' } 
    });

    res.json({
      attendanceSummary,
      leadStats: { 
        assigned: leadsAssignedToday, 
        contacted: leadsContactedToday 
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};