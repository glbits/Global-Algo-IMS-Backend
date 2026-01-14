const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const PayrollRun = require('../models/PayrollRun');
const PayrollItem = require('../models/PayrollItem');

// helper
const pad2 = (n) => String(n).padStart(2, '0');

// =========================
// HEADCOUNT (HR ONLY)
// =========================
exports.getHeadcount = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'Admin' } }).select('role');

    const byRole = {};
    for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;

    res.json({
      total: users.length,
      byRole
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// =========================
// ATTENDANCE HISTORY (HR ONLY)
// =========================
exports.getAttendanceHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const rows = await Attendance.find({ user: userId })
      .sort({ date: -1 })
      .select('date isLate createdAt');

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// =========================
// ORG CHART (HR ONLY)
// HR_ROOT -> All BMs -> their TLs -> their Employees
// =========================
exports.getOrgChart = async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: ['BranchManager', 'TeamLead', 'Employee'] }
    }).select('_id name role reportsTo branch');

    const map = new Map();
    for (const u of users) {
      map.set(String(u._id), {
        _id: String(u._id),
        name: u.name,
        role: u.role,
        branch: u.branch || '',
        reportsTo: u.reportsTo ? String(u.reportsTo) : null,
        children: []
      });
    }

    for (const node of map.values()) {
      if (node.reportsTo && map.has(node.reportsTo)) {
        map.get(node.reportsTo).children.push(node);
      }
    }

    const branchManagers = [];
    for (const node of map.values()) {
      if (node.role === 'BranchManager') branchManagers.push(node);
    }

    const roleOrder = { BranchManager: 0, TeamLead: 1, Employee: 2 };
    const sortTree = (n) => {
      n.children.sort((a, b) => {
        const ra = roleOrder[a.role] ?? 9;
        const rb = roleOrder[b.role] ?? 9;
        if (ra !== rb) return ra - rb;
        return (a.name || '').localeCompare(b.name || '');
      });
      n.children.forEach(sortTree);
    };
    branchManagers.forEach(sortTree);

    const tree = {
      _id: 'HR_ROOT',
      name: 'HR',
      role: 'HR',
      branch: '',
      children: branchManagers
    };

    res.json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// =========================
// PAYROLL (MANUAL)
// IMS provides ONLY attendance.
// HR fills salary/incentive/deduction/allowances manually.
// =========================
exports.generatePayroll = async (req, res) => {
  try {
    const { month, year, includeRoles } = req.body;

    const m = Number(month);
    const y = Number(year);
    if (!m || !y) return res.status(400).json({ msg: 'month and year are required' });
    if (m < 1 || m > 12) return res.status(400).json({ msg: 'month must be 1 to 12' });

    const run = await PayrollRun.create({
      period: { month: m, year: y },
      generatedBy: req.user.id,
      status: 'Draft'
    });

    const roles = Array.isArray(includeRoles) && includeRoles.length > 0
      ? includeRoles
      : ['TeamLead', 'Employee'];

    const users = await User.find({
      role: { $in: roles, $ne: 'Admin' }
    }).select('name email role');

    const monthStr = pad2(m);
    const prefix = `${y}-${monthStr}-`;

    const items = [];
    for (const u of users) {
      // ✅ Attendance from IMS
      const attendanceRecords = await Attendance.find({
        user: u._id,
        date: { $regex: new RegExp(`^${prefix}`) }
      }).select('isLate');

      const presentDays = attendanceRecords.length;
      const lateDays = attendanceRecords.filter(r => r.isLate).length;

      const payslipNumber = `PS-${y}${monthStr}-${String(u._id).slice(-6).toUpperCase()}`;

      // ✅ manual starts empty
      const manual = {
        basicSalary: 0,
        incentive: 0,
        deduction: 0,
        allowances: 0,
        remarks: ''
      };

      items.push({
        payrollRun: run._id,
        user: u._id,
        attendance: { presentDays, lateDays },
        manual,
        netPay: 0,
        payslipNumber
      });
    }

    if (items.length > 0) await PayrollItem.insertMany(items);

    res.json({
      msg: 'Payroll generated (Draft). Attendance loaded, HR must fill salary manually.',
      runId: run._id,
      count: items.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.getPayrollRun = async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await PayrollRun.findById(runId);
    if (!run) return res.status(404).json({ msg: 'Payroll run not found' });

    const items = await PayrollItem.find({ payrollRun: runId })
      .populate('user', 'name email role')
      .sort({ createdAt: 1 });

    res.json({ run, items });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.updatePayrollItem = async (req, res) => {
  try {
    const { payrollItemId } = req.params;

    const item = await PayrollItem.findById(payrollItemId);
    if (!item) return res.status(404).json({ msg: 'Payroll item not found' });

    const run = await PayrollRun.findById(item.payrollRun);
    if (run?.status === 'Finalized') {
      return res.status(400).json({ msg: 'Payroll run is finalized. Cannot edit.' });
    }

    const incoming = req.body.manual || {};

    item.manual = {
      ...item.manual.toObject(),
      ...incoming,
      basicSalary: Number(incoming.basicSalary ?? item.manual.basicSalary ?? 0),
      incentive: Number(incoming.incentive ?? item.manual.incentive ?? 0),
      deduction: Number(incoming.deduction ?? item.manual.deduction ?? 0),
      allowances: Number(incoming.allowances ?? item.manual.allowances ?? 0),
      remarks: typeof incoming.remarks === 'string' ? incoming.remarks : (item.manual.remarks || '')
    };

    // ✅ auto netPay based on manual values
    const basic = Number(item.manual.basicSalary || 0);
    const incentive = Number(item.manual.incentive || 0);
    const allowances = Number(item.manual.allowances || 0);
    const deduction = Number(item.manual.deduction || 0);

    item.netPay = Math.max(0, basic + incentive + allowances - deduction);

    await item.save();

    const populated = await PayrollItem.findById(item._id).populate('user', 'name email role');
    res.json({ msg: 'Payroll item updated', item: populated });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.finalizePayrollRun = async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await PayrollRun.findById(runId);
    if (!run) return res.status(404).json({ msg: 'Payroll run not found' });

    run.status = 'Finalized';
    await run.save();

    res.json({ msg: 'Payroll run finalized', run });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// ✅ Payslip output (JSON). Frontend can print it.
exports.getPayslip = async (req, res) => {
  try {
    const { payrollItemId } = req.params;

    const item = await PayrollItem.findById(payrollItemId).populate('user', 'name email role branch');
    if (!item) return res.status(404).json({ msg: 'Payroll item not found' });

    const run = await PayrollRun.findById(item.payrollRun);
    if (!run) return res.status(404).json({ msg: 'Payroll run not found' });

    return res.json({
      payslipNumber: item.payslipNumber,
      period: run.period, // { month, year }
      user: item.user, // { name, email, role, branch }
      attendance: {
        presentDays: item.attendance?.presentDays ?? 0,
        lateDays: item.attendance?.lateDays ?? 0
      },
      manual: {
        basicSalary: item.manual?.basicSalary ?? 0,
        allowances: item.manual?.allowances ?? 0,
        incentive: item.manual?.incentive ?? 0,
        deduction: item.manual?.deduction ?? 0,
        remarks: item.manual?.remarks ?? ''
      },
      netPay: item.netPay ?? 0,
      createdAt: item.createdAt
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server Error');
  }
};
