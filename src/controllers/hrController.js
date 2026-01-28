const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const PayrollRun = require('../models/PayrollRun');
const PayrollItem = require('../models/PayrollItem');
const PDFDocument = require('pdfkit');

const pad2 = (n) => String(n).padStart(2, '0');

const daysInMonth = (year, month1to12) => new Date(year, month1to12, 0).getDate();

// Counts attendance days from Attendance collection.
// Online/On-call/Break/Lunch/Evaluation => 1 day
// Paid Leave => 1 day
// Half Day => 0.5 day
// Offline => 0 day
const computeAttendanceStats = async (userId, year, month) => {
  const prefix = `${year}-${pad2(month)}-`;

  const records = await Attendance.find({
    user: userId,
    date: { $regex: new RegExp(`^${prefix}`) }
  }).select('currentStatus isLate');

  const lateDays = records.filter(r => r.isLate).length;

  let attendanceDays = 0;
  let presentDays = 0;

  for (const r of records) {
    const st = r.currentStatus;

    if (st === 'Half Day') {
      attendanceDays += 0.5;
      presentDays += 0.5;
    } else if (st === 'Paid Leave') {
      attendanceDays += 1;
      presentDays += 1;
    } else if (st && st !== 'Offline') {
      attendanceDays += 1;
      presentDays += 1;
    }
  }

  return { presentDays, lateDays, attendanceDays };
};

const recalcPayroll = (item) => {
  const wd = Number(item.attendance?.workingDays || 0);
  const ad = Number(item.attendance?.attendanceDays || 0);

  const basic = Number(item.manual?.basicSalary || 0);
  const incentive = Number(item.manual?.incentive || 0);
  const allowances = Number(item.manual?.allowances || 0);
  const deduction = Number(item.manual?.deduction || 0);

  const gross = wd > 0 ? Math.round((basic * ad) / wd) : 0;
  const net = Math.max(0, Math.round(gross + incentive + allowances - deduction));

  item.grossSalary = gross;
  item.netPay = net;

  item.attendance.absentDays = Math.max(0, wd - ad);
};

// =========================
// HEADCOUNT (HR ONLY)
// =========================
exports.getHeadcount = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'Admin' } }).select('role');

    const byRole = {};
    for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;

    res.json({ total: users.length, byRole });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// =========================
// ORG CHART (HR ONLY)
// =========================
exports.getOrgChart = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'Admin' } }).select('name email role reportingTo');
    res.json(users);
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

    const attendance = await Attendance.find({ user: userId }).sort({ date: -1 }).limit(60);
    res.json(attendance);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// =========================
// PAYROLL (Manual parameters like your sheet)
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

    // Prefill salary if your User model has salary.basic / salary.allowances (safe if absent)
    const users = await User.find({
      role: { $in: roles, $ne: 'Admin' }
    }).select('name email role branch salary');

    const workingDays = daysInMonth(y, m);
    const monthStr = pad2(m);

    const items = [];

    for (const u of users) {
      const stats = await computeAttendanceStats(u._id, y, m);

      const payslipNumber = `PS-${y}${monthStr}-${String(u._id).slice(-6).toUpperCase()}`;

      const item = new PayrollItem({
        payrollRun: run._id,
        user: u._id,
        attendance: {
          presentDays: stats.presentDays,
          lateDays: stats.lateDays,
          attendanceDays: stats.attendanceDays,
          workingDays,
          absentDays: Math.max(0, workingDays - stats.attendanceDays)
        },
        manual: {
          designation: '',
          basicSalary: Number(u.salary?.basic || 0),
          incentive: 0,
          deduction: 0,
          allowances: Number(u.salary?.allowances || 0),
          remarks: ''
        },
        grossSalary: 0,
        netPay: 0,
        payslipNumber
      });

      recalcPayroll(item);
      items.push(item);
    }

    if (items.length > 0) await PayrollItem.insertMany(items);

    res.json({
      msg: 'Payroll generated (Draft). Attendance loaded, HR can edit working days/attendance and salary fields.',
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
      .populate('user', 'name email role branch')
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

    const incomingManual = req.body.manual || {};
    const incomingAtt = req.body.attendance || {};

    // Manual (HR input)
    item.manual = {
      ...item.manual.toObject(),
      ...incomingManual,
      designation: typeof incomingManual.designation === 'string' ? incomingManual.designation : (item.manual.designation || ''),
      basicSalary: Number(incomingManual.basicSalary ?? item.manual.basicSalary ?? 0),
      incentive: Number(incomingManual.incentive ?? item.manual.incentive ?? 0),
      deduction: Number(incomingManual.deduction ?? item.manual.deduction ?? 0),
      allowances: Number(incomingManual.allowances ?? item.manual.allowances ?? 0),
      remarks: typeof incomingManual.remarks === 'string' ? incomingManual.remarks : (item.manual.remarks || '')
    };

    // Attendance overrides (HR input like your sheet)
    item.attendance = {
      ...item.attendance.toObject(),
      ...incomingAtt,
      workingDays: Number(incomingAtt.workingDays ?? item.attendance.workingDays ?? 0),
      attendanceDays: Number(incomingAtt.attendanceDays ?? item.attendance.attendanceDays ?? 0),
      absentDays: Number(item.attendance?.absentDays || 0)
    };

    recalcPayroll(item);

    await item.save();

    const populated = await PayrollItem.findById(item._id).populate('user', 'name email role branch');
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

// ✅ Payslip output (JSON)
exports.getPayslip = async (req, res) => {
  try {
    const { payrollItemId } = req.params;

    const item = await PayrollItem.findById(payrollItemId).populate('user', 'name email role branch');
    if (!item) return res.status(404).json({ msg: 'Payroll item not found' });

    const run = await PayrollRun.findById(item.payrollRun);
    if (!run) return res.status(404).json({ msg: 'Payroll run not found' });

    recalcPayroll(item);

    return res.json({
      payslipNumber: item.payslipNumber,
      period: run.period,
      user: item.user,
      attendance: {
        workingDays: item.attendance?.workingDays ?? 0,
        attendanceDays: item.attendance?.attendanceDays ?? 0,
        absentDays: item.attendance?.absentDays ?? 0,
        presentDays: item.attendance?.presentDays ?? 0,
        lateDays: item.attendance?.lateDays ?? 0
      },
      manual: {
        designation: item.manual?.designation ?? '',
        basicSalary: item.manual?.basicSalary ?? 0,
        allowances: item.manual?.allowances ?? 0,
        incentive: item.manual?.incentive ?? 0,
        deduction: item.manual?.deduction ?? 0,
        remarks: item.manual?.remarks ?? ''
      },
      grossSalary: item.grossSalary ?? 0,
      netPay: item.netPay ?? 0,
      createdAt: item.createdAt
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server Error');
  }
};

// ✅ Payslip PDF
exports.getPayslipPdf = async (req, res) => {
  try {
    const { payrollItemId } = req.params;

    const item = await PayrollItem.findById(payrollItemId).populate('user', 'name email role branch');
    if (!item) return res.status(404).json({ msg: 'Payroll item not found' });

    const run = await PayrollRun.findById(item.payrollRun);
    if (!run) return res.status(404).json({ msg: 'Payroll run not found' });

    recalcPayroll(item);

    const periodStr = `${pad2(run.period.month)}/${run.period.year}`;
    const filename = `${item.payslipNumber}-${periodStr.replace('/', '-')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text('PAYSLIP', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Payslip No: ${item.payslipNumber}`, { align: 'right' });
    doc.fontSize(11).text(`Period: ${periodStr}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).text('Employee Details', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11)
      .text(`Name: ${item.user?.name || '—'}`)
      .text(`Email: ${item.user?.email || '—'}`)
      .text(`Role: ${item.user?.role || '—'}`)
      .text(`Designation: ${item.manual?.designation || '—'}`)
      .text(`Branch: ${item.user?.branch || '—'}`);
    doc.moveDown();

    doc.fontSize(12).text('Attendance Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11)
      .text(`Working Days: ${Number(item.attendance?.workingDays || 0)}`)
      .text(`Attendance Days: ${Number(item.attendance?.attendanceDays || 0)}`)
      .text(`Absent Days: ${Number(item.attendance?.absentDays || 0)}`)
      .text(`Late Days: ${Number(item.attendance?.lateDays || 0)}`);
    doc.moveDown();

    doc.fontSize(12).text('Salary Breakdown', { underline: true });
    doc.moveDown(0.5);

    const basic = Number(item.manual?.basicSalary || 0);
    const gross = Number(item.grossSalary || 0);
    const incentive = Number(item.manual?.incentive || 0);
    const allowances = Number(item.manual?.allowances || 0);
    const deduction = Number(item.manual?.deduction || 0);
    const net = Number(item.netPay || 0);

    const row = (label, value) => {
      doc.fontSize(11).text(label, { continued: true });
      doc.fontSize(11).text(String(value), { align: 'right' });
    };

    row('Basic Salary', basic);
    row('Gross Salary (Basic × Attendance/Working)', gross);
    row('Incentive', incentive);
    row('Allowances', allowances);
    row('Deduction', deduction);

    doc.moveDown(0.5);
    doc.fontSize(12).text(`Final Salary: ${net}`, { align: 'right' });
    doc.moveDown();

    if (item.manual?.remarks) {
      doc.fontSize(12).text('Remarks', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).text(item.manual.remarks);
      doc.moveDown();
    }

    doc.fontSize(10).text('This is a system generated payslip.', { align: 'center' });
    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server Error');
  }
};
