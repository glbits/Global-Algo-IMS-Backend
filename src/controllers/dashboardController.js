const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Lead = require('../models/Lead');

exports.getManagerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const today = new Date().toISOString().split('T')[0];

    // 1. IDENTIFY TEAM (Who do I monitor?)
    let teamIds = [];
    if (role === 'Admin') {
      const allUsers = await User.find({ role: { $ne: 'Admin' } }); // Admin sees everyone
      teamIds = allUsers.map(u => u._id);
    } else {
      // Find direct reports (BM -> TLs -> Employees)
      // For simplicity in this structure, we'll fetch direct subordinates
      // In a real complex tree, you might need a recursive fetch
      const directReports = await User.find({ reportsTo: userId });
      teamIds = directReports.map(u => u._id);
    }

    // 2. LIVE ATTENDANCE (Present/Late/Live Status)
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

    // 3. LEAD UTILIZATION (Assigned vs Contacted Today)
    // Count leads assigned to MY TEAM today
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);

    const leadsAssignedToday = await Lead.countDocuments({
      assignedTo: { $in: teamIds },
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const leadsContactedToday = await Lead.countDocuments({
      "history.by": { $in: teamIds },
      "history.date": { $gte: startOfDay, $lte: endOfDay }
    });

    res.json({
      attendanceSummary,
      leadStats: { assigned: leadsAssignedToday, contacted: leadsContactedToday }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};