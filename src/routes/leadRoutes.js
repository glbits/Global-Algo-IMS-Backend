const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  distributeLeads, 
  uploadLeads, 
  getMyLeads,
  getUploadBatches, // NEW
  getBatchDetails,   // NEW
getDashboardStats,
logCall,
getLeadLifecycle,
getArchivedLeads,
adminReassign

} = require('../controllers/leadController');

const auth = require('../middleware/auth');
const gatekeeper = require('../middleware/gatekeeper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Admin: Upload
router.post('/upload', auth, gatekeeper, upload.single('file'), uploadLeads);

// Admin: Distribute
router.post('/distribute', auth, gatekeeper, distributeLeads);

// User: View My Leads
router.get('/my-leads', auth, gatekeeper, getMyLeads);

// Admin: View File History
router.get('/batches', auth, gatekeeper, getUploadBatches);
router.get('/batch/:id', auth, gatekeeper, getBatchDetails);


router.get('/stats', auth, gatekeeper, getDashboardStats);
router.post('/log-call', auth, gatekeeper, logCall);



router.get('/:id/lifecycle', auth, gatekeeper, getLeadLifecycle);
router.get('/archived', auth, gatekeeper, getArchivedLeads);


router.post('/reassign', auth, gatekeeper, adminReassign);


module.exports = router;