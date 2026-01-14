const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');
const hr = require('../controllers/hrController');

const HR_ONLY = authorizeRoles('HR');

// HR ONLY
router.get('/headcount', auth, HR_ONLY, hr.getHeadcount);
router.get('/org-chart', auth, HR_ONLY, hr.getOrgChart);
router.get('/attendance/:userId', auth, HR_ONLY, hr.getAttendanceHistory);

// Payroll (manual)
router.post('/payroll/generate', auth, HR_ONLY, hr.generatePayroll);
router.get('/payroll/:runId', auth, HR_ONLY, hr.getPayrollRun);
router.patch('/payroll/item/:payrollItemId', auth, HR_ONLY, hr.updatePayrollItem);
router.post('/payroll/:runId/finalize', auth, HR_ONLY, hr.finalizePayrollRun);

// ✅ Payslip JSON
router.get('/payslip/:payrollItemId', auth, HR_ONLY, hr.getPayslip);

module.exports = router;
