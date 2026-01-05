const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Lead = require('../models/Lead');

exports.getManagerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const today = new Date().toISOString().split('T')[0];

    // --- 1. FETCH ALL TEAM MEMBERS (Including Self) ---
    let allTeamUsers = [];

   if (role === 'Admin' || role === 'LeadManager') {
      allTeamUsers = await User.find({});
    } else {
      // Regular Manager Logic
      allTeamUsers = await User.find({ 
        $or: [
            { reportsTo: userId },
            { _id: userId } 
        ]
      });
    }

    // --- 2. CREATE SPECIFIC LISTS ---
    
    // LIST A: For Attendance (Filter out Admin & BM)
    // We only track attendance for TeamLead and Employee
    const attendanceUsers = allTeamUsers.filter(u => 
      u.role === 'TeamLead' || u.role === 'Employee'
    );
    const attendanceIds = attendanceUsers.map(u => u._id);

    // LIST B: For Lead Stats (Include Everyone)
    // Calls made by Admin or BM should still count in the "Work Done" stats
    const leadStatsIds = allTeamUsers.map(u => u._id);


    // --- 3. CALCULATE ATTENDANCE (Using List A) ---
    const attendanceRecords = await Attendance.find({ 
      user: { $in: attendanceIds }, 
      date: today 
    }).populate('user', 'name role');

    const attendanceSummary = {
      total: attendanceIds.length, // This will now show "0/X" where X is only trackable staff
      present: attendanceRecords.length,
      late: attendanceRecords.filter(r => r.isLate).length,
      absent: attendanceIds.length - attendanceRecords.length,
      onCall: attendanceRecords.filter(r => r.currentStatus === 'On-call').map(r => r.user.name),
      online: attendanceRecords.filter(r => r.currentStatus === 'Online').length
    };

    // --- 4. CALCULATE LEAD VELOCITY (Using List B) ---
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);

    // A. Leads currently held by the team (Active Pool)
    const leadsAssignedToday = await Lead.countDocuments({
      assignedTo: { $in: leadStatsIds },
      status: { $ne: 'Archived' } 
    });

    // B. Actual CALLS made Today (By anyone in the team, including Admin)
    const leadsContactedToday = await Lead.countDocuments({
      "history.by": { $in: leadStatsIds },
      "history.date": { $gte: startOfDay, $lte: endOfDay },
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