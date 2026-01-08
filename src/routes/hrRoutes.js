const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');
const hr = require('../controllers/hrController');

// HR-level access (Admin, BranchManager, HR)
const HR_ALLOWED = authorizeRoles('Admin', 'BranchManager', 'HR');

/**
 * ==============================
 * HR DASHBOARD ROUTES
 * Base path: /api/hr
 * ==============================
 */

// --- HEADCOUNT ---
router.get('/headcount', auth, HR_ALLOWED, hr.getHeadcount);

// --- ORG CHART (HR -> BM -> TL -> EMP) ---
router.get('/org-chart', auth, HR_ALLOWED, hr.getOrgChart);

// --- ATTENDANCE HISTORY (TL + Agents) ---
router.get('/attendance/:userId', auth, HR_ALLOWED, hr.getAttendanceHistory);

// --- PAYROLL ---
router.post('/payroll/generate', auth, HR_ALLOWED, hr.generatePayroll);
router.get('/payroll/:runId', auth, HR_ALLOWED, hr.getPayrollRun);
router.post('/payroll/:runId/finalize', auth, HR_ALLOWED, hr.finalizePayrollRun);

// --- PAYSLIP PDF ---
router.get('/payslip/:payrollItemId/pdf', auth, HR_ALLOWED, hr.getPayslipPdf);

module.exports = router;
