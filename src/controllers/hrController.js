const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

// These two models must exist as I shared earlier:
// src/models/PayrollRun.js
// src/models/PayrollItem.js
const PayrollRun = require('../models/PayrollRun');
const PayrollItem = require('../models/PayrollItem');

// PDF for payslip printing
let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch (e) {
  PDFDocument = null;
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * =========================================
 * 1) HEADCOUNT (Org summary)
 * =========================================
 * GET /api/hr/headcount
 */
exports.getHeadcount = async (req, res) => {
  try {
    // excluding Admin (optional)
    const users = await User.find({ role: { $ne: 'Admin' } }).select('role');

    const summary = users.reduce(
      (acc, u) => {
        acc.total += 1;
        acc.byRole[u.role] = (acc.byRole[u.role] || 0) + 1;
        return acc;
      },
      { total: 0, byRole: {} }
    );

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

/**
 * =========================================
 * 2) ATTENDANCE HISTORY (TL + Agents)
 * =========================================
 * GET /api/hr/attendance/:userId?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
exports.getAttendanceHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;

    const target = await User.findById(userId).select('name role email');
    if (!target) return res.status(404).json({ msg: 'User not found' });
    if (target.role === 'Admin') return res.status(403).json({ msg: 'Forbidden' });

    const query = { user: userId };
    if (from && to) query.date = { $gte: from, $lte: to };

    const records = await Attendance.find(query).sort({ date: -1 });

    res.json({ user: target, records });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

/**
 * =========================================
 * 3) HR ORG CHART (Tree)
 * =========================================
 * HR (virtual root) -> All BranchManagers -> Their TeamLeads -> Their Employees
 *
 * GET /api/hr/org-chart
 */
exports.getOrgChart = async (req, res) => {
  try {
    // fetch all BMs, TLs, Employees (ignore Admin)
    const users = await User.find({
      role: { $in: ['BranchManager', 'TeamLead', 'Employee'] }
    }).select('_id name role reportsTo branch');

    // Build a lookup map: id => node
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

    // Attach each node to its parent (if parent exists in map)
    for (const node of map.values()) {
      if (node.reportsTo && map.has(node.reportsTo)) {
        map.get(node.reportsTo).children.push(node);
      }
    }

    // Roots for HR view = all BranchManagers (even if their parent isn't in map)
    const branchManagers = [];
    for (const node of map.values()) {
      if (node.role === 'BranchManager') branchManagers.push(node);
    }

    // Optional: sort children by role then name for stable chart
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

    // Virtual root for frontend tree components
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

/**
 * =========================================
 * 4) PAYROLL: GENERATE (Draft)
 * =========================================
 * POST /api/hr/payroll/generate
 * Body: { month: 1-12, year: 2026, includeRoles?: ["TeamLead","Employee"] }
 */
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

    // default payroll for TL + Employee unless overridden
    const roles = Array.isArray(includeRoles) && includeRoles.length > 0
      ? includeRoles
      : ['TeamLead', 'Employee'];

    const users = await User.find({
      role: { $in: roles, $ne: 'Admin' }
    }).select('name email role salary');

    const monthStr = pad2(m);
    const prefix = `${y}-${monthStr}-`;

    const items = [];
    for (const u of users) {
      const attendanceRecords = await Attendance.find({
        user: u._id,
        date: { $regex: new RegExp(`^${prefix}`) }
      }).select('isLate');

      const presentDays = attendanceRecords.length;
      const lateDays = attendanceRecords.filter(r => r.isLate).length;

      // Simple penalty (customize)
      const attendancePenalty = lateDays * 50;

      const basic = Number(u.salary?.basic || 0);
      const allowances = Number(u.salary?.allowances || 0);
      const fixedDeduction = Number(u.salary?.deductions || 0);

      const netPay = Math.max(0, basic + allowances - fixedDeduction - attendancePenalty);

      const payslipNumber = `PS-${y}${monthStr}-${String(u._id).slice(-6).toUpperCase()}`;

      items.push({
        payrollRun: run._id,
        user: u._id,

        attendance: { presentDays, lateDays },

        earnings: { basic, allowances },
        deductions: { fixed: fixedDeduction, attendancePenalty },

        netPay,
        payslipNumber
      });
    }

    if (items.length > 0) {
      await PayrollItem.insertMany(items);
    }

    res.json({
      msg: 'Payroll generated (Draft)',
      runId: run._id,
      count: items.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

/**
 * =========================================
 * 5) PAYROLL: VIEW RUN
 * =========================================
 * GET /api/hr/payroll/:runId
 */
exports.getPayrollRun = async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await PayrollRun.findById(runId).populate('generatedBy', 'name role');
    if (!run) return res.status(404).json({ msg: 'Payroll run not found' });

    const items = await PayrollItem.find({ payrollRun: runId })
      .populate('user', 'name email role');

    res.json({ run, items });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

/**
 * =========================================
 * 6) PAYROLL: FINALIZE RUN
 * =========================================
 * POST /api/hr/payroll/:runId/finalize
 */
exports.finalizePayrollRun = async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await PayrollRun.findById(runId);
    if (!run) return res.status(404).json({ msg: 'Payroll run not found' });

    run.status = 'Finalized';
    await run.save();

    res.json({ msg: 'Payroll run finalized' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

/**
 * =========================================
 * 7) PAYSLIP PDF (PRINT)
 * =========================================
 * GET /api/hr/payslip/:payrollItemId/pdf
 */
exports.getPayslipPdf = async (req, res) => {
  try {
    if (!PDFDocument) {
      return res.status(500).json({ msg: 'pdfkit is not installed. Run: npm i pdfkit' });
    }

    const { payrollItemId } = req.params;

    const item = await PayrollItem.findById(payrollItemId)
      .populate('user', 'name email role')
      .populate('payrollRun');

    if (!item) return res.status(404).json({ msg: 'Payslip not found' });

    const { month, year } = item.payrollRun.period;
    const periodLabel = `${pad2(month)}/${year}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.payslipNumber}.pdf"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text('PAYSLIP', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(12).text(`Payslip No: ${item.payslipNumber}`);
    doc.text(`Period: ${periodLabel}`);
    doc.moveDown();

    doc.fontSize(12).text(`Employee: ${item.user.name}`);
    doc.text(`Role: ${item.user.role}`);
    doc.text(`Email: ${item.user.email}`);
    doc.moveDown();

    doc.fontSize(12).text('Attendance');
    doc.text(`Present Days: ${item.attendance.presentDays}`);
    doc.text(`Late Days: ${item.attendance.lateDays}`);
    doc.moveDown();

    doc.fontSize(12).text('Earnings');
    doc.text(`Basic: ${item.earnings.basic}`);
    doc.text(`Allowances: ${item.earnings.allowances}`);
    doc.moveDown();

    doc.fontSize(12).text('Deductions');
    doc.text(`Fixed: ${item.deductions.fixed}`);
    doc.text(`Attendance Penalty: ${item.deductions.attendancePenalty}`);
    doc.moveDown();

    doc.fontSize(14).text(`Net Pay: ${item.netPay}`, { underline: true });
    doc.moveDown(2);

    doc.fontSize(10).text('This is a system generated payslip.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};
