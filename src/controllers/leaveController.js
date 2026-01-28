const LeaveRequest = require('../models/LeaveRequest');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

// -----------------------------
// Helpers
// -----------------------------

// YYYY-MM-DD -> Date (UTC-safe parsing)
const parseYMD = (ymd) => {
  // Ensure we parse as UTC midnight to avoid TZ day shifts
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};

const formatYMD = (dateObj) => {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const eachDateInclusive = (startYmd, endYmd) => {
  const start = parseYMD(startYmd);
  const end = parseYMD(endYmd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  if (start > end) return [];

  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatYMD(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
};

const isValidYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

// -----------------------------
// EMPLOYEE: Create leave request
// POST /api/leaves
// -----------------------------
exports.createLeaveRequest = async (req, res) => {
  try {
    const { startDate, endDate, type, reason } = req.body;

    if (!isValidYMD(startDate) || !isValidYMD(endDate)) {
      return res.status(400).json({ msg: 'startDate and endDate must be YYYY-MM-DD' });
    }

    const t = type || 'Paid Leave';
    if (!['Paid Leave', 'Half Day'].includes(t)) {
      return res.status(400).json({ msg: "Invalid type. Use 'Paid Leave' or 'Half Day'." });
    }

    if (parseYMD(startDate) > parseYMD(endDate)) {
      return res.status(400).json({ msg: 'startDate cannot be after endDate' });
    }

    // Prevent overlapping APPROVED leaves (simple guard)
    const overlap = await LeaveRequest.findOne({
      user: req.user.id,
      status: 'Approved',
      $or: [{ startDate: { $lte: endDate }, endDate: { $gte: startDate } }]
    }).select('_id');

    if (overlap) {
      return res.status(400).json({ msg: 'You already have an approved leave overlapping these dates.' });
    }

    const doc = await LeaveRequest.create({
      user: req.user.id,
      startDate,
      endDate,
      type: t,
      reason: typeof reason === 'string' ? reason : ''
    });

    res.json({ msg: 'Leave request submitted', leave: doc });
  } catch (err) {
    console.error('createLeaveRequest error:', err);
    res.status(500).send('Server Error');
  }
};

// -----------------------------
// EMPLOYEE: list my leave requests
// GET /api/leaves/mine
// -----------------------------
exports.getMyLeaves = async (req, res) => {
  try {
    const rows = await LeaveRequest.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .select('startDate endDate type reason status decidedAt decisionRemarks createdAt');

    res.json(rows);
  } catch (err) {
    console.error('getMyLeaves error:', err);
    res.status(500).send('Server Error');
  }
};

// -----------------------------
// EMPLOYEE: cancel pending request
// POST /api/leaves/:id/cancel
// -----------------------------
exports.cancelMyLeave = async (req, res) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ msg: 'Leave not found' });
    if (String(leave.user) !== String(req.user.id)) return res.status(403).json({ msg: 'Forbidden' });

    if (leave.status !== 'Pending') {
      return res.status(400).json({ msg: 'Only Pending requests can be cancelled' });
    }

    leave.status = 'Cancelled';
    await leave.save();

    res.json({ msg: 'Cancelled', leave });
  } catch (err) {
    console.error('cancelMyLeave error:', err);
    res.status(500).send('Server Error');
  }
};

// -----------------------------
// HR: List all leave requests (+ filter)
// GET /api/leaves/hr?userId=&status=
// -----------------------------
exports.hrListLeaves = async (req, res) => {
  try {
    const { userId, status } = req.query;

    const q = {};
    if (userId) q.user = userId;
    if (status) q.status = status;

    const rows = await LeaveRequest.find(q)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 });

    res.json(rows);
  } catch (err) {
    console.error('hrListLeaves error:', err);
    res.status(500).send('Server Error');
  }
};

// -----------------------------
// HR: Approve or Reject
// POST /api/leaves/hr/:id/decide
// body: { decision: 'Approved'|'Rejected', remarks?: string }
// -----------------------------
exports.hrDecideLeave = async (req, res) => {
  try {
    const { decision, remarks } = req.body;
    if (!['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({ msg: "decision must be 'Approved' or 'Rejected'" });
    }

    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ msg: 'Leave not found' });

    if (leave.status !== 'Pending') {
      return res.status(400).json({ msg: `Only Pending requests can be decided. Current: ${leave.status}` });
    }

    leave.status = decision;
    leave.decidedBy = req.user.id;
    leave.decidedAt = new Date();
    leave.decisionRemarks = typeof remarks === 'string' ? remarks : '';
    await leave.save();

    // ✅ Integrate with Attendance on APPROVAL
    if (decision === 'Approved') {
      const dates = eachDateInclusive(leave.startDate, leave.endDate);
      const statusToSet = leave.type === 'Half Day' ? 'Half Day' : 'Paid Leave';

      for (const ymd of dates) {
        await Attendance.findOneAndUpdate(
          { user: leave.user, date: ymd },
          {
            currentStatus: statusToSet,
            isLate: false,
            lateBy: 0,
            lastStatusChange: new Date(),
            $push: {
              history: {
                status: statusToSet,
                startTime: new Date(),
                actionBy: req.user.id,
                details: `Auto from Approved Leave (${leave._id})${leave.decisionRemarks ? `: ${leave.decisionRemarks}` : ''}`
              }
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    const populated = await LeaveRequest.findById(leave._id).populate('user', 'name email role');
    res.json({ msg: `Leave ${decision}`, leave: populated });
  } catch (err) {
    console.error('hrDecideLeave error:', err);
    res.status(500).send('Server Error');
  }
};

// -----------------------------
// HR helper: list employees (non-admin)
// GET /api/leaves/hr/employees
// -----------------------------
exports.hrListEmployees = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'Admin' } })
      .select('name email role')
      .sort({ name: 1 });
    res.json(users);
  } catch (err) {
    console.error('hrListEmployees error:', err);
    res.status(500).send('Server Error');
  }
};
