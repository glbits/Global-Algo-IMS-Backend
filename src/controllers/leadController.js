const xlsx = require('xlsx');
const mongoose = require('mongoose');
const mammoth = require('mammoth'); 
const Lead = require('../models/Lead');
const User = require('../models/User');
<<<<<<< HEAD
const UploadBatch = require('../models/UploadBatch'); 
=======
const UploadBatch = require('../models/UploadBatch');
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
const Client = require('../models/Client');
const Task = require('../models/Task');

// --- HELPER: PHONE CLEANING ---
const cleanPhoneNumber = (raw) => {
  if (!raw) return null;

  let clean = String(raw).replace(/\D/g, '');

  if (clean.length > 10 && clean.startsWith('91')) {
    clean = clean.substring(2);
  }

  if (clean.length > 10 && clean.startsWith('0')) {
    clean = clean.substring(1);
  }

  return clean.length === 10 ? clean : null;
};

// --- HELPER: NAME CLEANING ---
const extractNameFromContext = (fullText, matchIndex, matchLength, rawPhoneString) => {
  const start = fullText.lastIndexOf('\n', matchIndex);
  const lineStart = start === -1 ? 0 : start + 1;

  const end = fullText.indexOf('\n', matchIndex + matchLength);
  const lineEnd = end === -1 ? fullText.length : end;

  let line = fullText.substring(lineStart, lineEnd);
  let text = line.replace(rawPhoneString, '');

  text = text.replace(/name[:\s-]*|mobile[:\s-]*|phone[:\s-]*/gi, '');
  text = text.replace(/[^a-zA-Z\s]/g, ' ').trim();
  text = text.replace(/\s+/g, ' ');

  return text.length > 1 ? text : "Unknown (Doc)";
};

// --- 1. UPLOAD LEADS (FULL TEXT SCAN VERSION) ---
exports.uploadLeads = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "No file uploaded" });
    }

    // A. Create Batch Record
    const newBatch = new UploadBatch({
      fileName: req.file.originalname,
      uploadedBy: req.user.id,
      totalCount: 0
    });
    const savedBatch = await newBatch.save();

<<<<<<< HEAD
    // B. Read Excel/CSV File
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Get data as array of arrays
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // C. Process Rows
=======
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
    const validLeads = [];
    const seenNumbers = new Set();

<<<<<<< HEAD
    for (const row of rawRows) {
      if (!row || row.length === 0) continue;
=======
    const isDocx =
      req.file.originalname.match(/\.docx$/i) ||
      req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913

    // --- STRATEGY A: DOCX PROCESSING ---
    if (isDocx) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      const fullText = result.value;

<<<<<<< HEAD
      const cleanPhone = cleanPhoneNumber(rawPhone);

      if (cleanPhone && !seenNumbers.has(cleanPhone)) {
        seenNumbers.add(cleanPhone);
        
        validLeads.push({
          phoneNumber: cleanPhone,
          name: rawName || "Unknown",
          assignedTo: req.user.id,
          status: 'New',
          batchId: savedBatch._id,
          data: {
            originalRaw: rawPhone
=======
      const phoneRegex = /(?:\+?91|0)?\s*[6-9](?:[\s-]*\d){9}/g;
      const matches = [...fullText.matchAll(phoneRegex)];

      for (const match of matches) {
        const rawMatch = match[0];
        const clean = cleanPhoneNumber(rawMatch);

        if (clean && ['6', '7', '8', '9'].includes(clean[0])) {
          if (!seenNumbers.has(clean)) {
            seenNumbers.add(clean);

            const detectedName = extractNameFromContext(
              fullText,
              match.index,
              rawMatch.length,
              rawMatch
            );

            validLeads.push({
              phoneNumber: clean,
              name: detectedName,
              assignedTo: req.user.id,
              status: 'New',
              batchId: savedBatch._id,
              data: {
                originalRaw: rawMatch.replace(/\n/g, ' ')
              }
            });
          }
        }
      }
    }

    // --- STRATEGY B: EXCEL/CSV PROCESSING ---
    else {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      for (const row of rawRows) {
        if (!row || row.length === 0) continue;

        const rowPhones = new Set();

        for (const cell of row) {
          if (!cell) continue;

          const parts = String(cell).split(/[,/\n&|;]+/);

          for (const part of parts) {
            const clean = cleanPhoneNumber(part);
            if (clean && ['6', '7', '8', '9'].includes(clean[0])) {
              rowPhones.add(clean);
            }
          }
        }

        if (rowPhones.size === 0) continue;

        // Name Logic
        let detectedName = "Unknown";
        const isName = (str) => {
          if (!str) return false;
          const s = String(str).trim();
          if (s.length < 2) return false;
          if (!/[a-zA-Z]/.test(s)) return false;
          if (/\d/.test(s)) return false;
          const lower = s.toLowerCase();
          if (['status', 'date', 'remarks', 'amount', 'mobile', 'name', 'phone'].includes(lower)) return false;
          return true;
        };

        if (isName(row[1])) detectedName = String(row[1]).trim();
        else if (isName(row[0])) detectedName = String(row[0]).trim();
        else {
          for (const cell of row) {
            if (isName(cell)) {
              detectedName = String(cell).trim();
              break;
            }
          }
        }

        rowPhones.forEach(phone => {
          if (!seenNumbers.has(phone)) {
            seenNumbers.add(phone);
            validLeads.push({
              phoneNumber: phone,
              name: detectedName,
              assignedTo: req.user.id,
              status: 'New',
              batchId: savedBatch._id,
              data: { originalRaw: JSON.stringify(row) }
            });
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
          }
        });
      }
    }

    // --- FINAL SAVE ---
    if (validLeads.length === 0) {
      await UploadBatch.findByIdAndDelete(savedBatch._id);
      return res.status(400).json({ msg: "No valid mobile numbers found in file." });
    }

    try {
      await Lead.insertMany(validLeads, { ordered: false });

      savedBatch.totalCount = validLeads.length;
      await savedBatch.save();

      res.json({ msg: `Success! Extracted ${validLeads.length} leads from file.`, batchId: savedBatch._id });

    } catch (insertError) {
      if (insertError.writeErrors) {
        const insertedCount = insertError.insertedDocs.length;
        savedBatch.totalCount = insertedCount;
        await savedBatch.save();
        res.json({
          msg: `Imported ${insertedCount} leads (Skipped ${validLeads.length - insertedCount} duplicates).`,
          batchId: savedBatch._id
        });
      } else {
        throw insertError;
      }
    }

  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ msg: "Server Error during Upload" });
  }
};

<<<<<<< HEAD
// --- 2. GET UPLOAD HISTORY (List of Files) ---
exports.getUploadBatches = async (req, res) => {
  try {
    const batches = await UploadBatch.find()
      .sort({ uploadDate: -1 }) 
      .populate('uploadedBy', 'name role'); // CORRECT: Includes role for the "Me" check
=======
// --- 2. GET ALL UPLOAD BATCHES ---
exports.getUploadBatches = async (req, res) => {
  try {
    const batches = await UploadBatch.find()
      .sort({ uploadDate: -1 })
      .populate('uploadedBy', 'name');
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
    res.json(batches);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// --- 3. GET LEADS FOR A SPECIFIC BATCH ---
exports.getBatchDetails = async (req, res) => {
  try {
    const leads = await Lead.find({ batchId: req.params.id });
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

<<<<<<< HEAD
// --- 4. DISTRIBUTE LEADS ---
exports.distributeLeads = async (req, res) => {
  const { assignments } = req.body;

  try {
    const distributorId = req.user.id;
    const distributorRole = req.user.role; 
=======
// ✅✅✅ --- 4. DISTRIBUTE LEADS (BATCH-WISE OR ALL BATCHES) ---
exports.distributeLeads = async (req, res) => {
  const { assignments, batchId } = req.body;

  try {
    const distributorId = req.user.id;
    const distributorRole = req.user.role;

    // ✅ CHANGE 1: batchId is NOT required anymore (null/undefined means ALL batches)
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ msg: "No distribution data provided." });
    }

<<<<<<< HEAD
    const totalRequested = assignments.reduce((sum, item) => sum + Number(item.count), 0);

    const availableLeads = await Lead.find({ 
      assignedTo: distributorId, 
      status: 'New' 
    });
=======
    const totalRequested = assignments.reduce((sum, item) => sum + Number(item.count || 0), 0);

    if (totalRequested <= 0) {
      return res.status(400).json({ msg: "Total distribution count must be greater than 0." });
    }

    // ✅ CHANGE 2: dynamic filter (batchId optional)
    const leadFilter = {
      assignedTo: distributorId,
      status: "New",
    };

    // If batchId provided -> filter by batch
    // If batchId missing/null -> ALL batches
    if (batchId) {
      leadFilter.batchId = batchId;
    }

    const availableLeads = await Lead.find(leadFilter).sort({ createdAt: 1 });
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913

    if (availableLeads.length < totalRequested) {
      return res.status(400).json({
        msg: `Insufficient leads. You have ${availableLeads.length}, but tried to distribute ${totalRequested}.`
      });
    }

    let currentIndex = 0;
    let distributedTotal = 0;

    for (const assignment of assignments) {
<<<<<<< HEAD
      const count = Number(assignment.count);
      
      if (count > 0) {
        const batch = availableLeads.slice(currentIndex, currentIndex + count);
        const batchIds = batch.map(l => l._id);

        const updates = batchIds.map(id => ({
=======
      const count = Number(assignment.count || 0);

      if (count > 0) {
        const chunk = availableLeads.slice(currentIndex, currentIndex + count);
        const leadIds = chunk.map(l => l._id);

        const updates = leadIds.map(id => ({
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
          updateOne: {
            filter: { _id: id },
            update: {
              $set: { assignedTo: assignment.userId },
<<<<<<< HEAD
              $push: { 
=======
              $push: {
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
                custodyChain: {
                  assignedTo: assignment.userId,
                  assignedBy: distributorId,
                  roleAtTime: distributorRole,
                  assignedDate: new Date()
                },
                history: {
                  action: 'Assignment',
                  by: distributorId,
                  details: batchId
                    ? `Passed to ${assignment.userId} by ${distributorRole} (Batch: ${batchId})`
                    : `Passed to ${assignment.userId} by ${distributorRole} (ALL Batches)`,
                  date: new Date()
                }
              }
            }
          }
        }));

        if (updates.length > 0) {
          await Lead.bulkWrite(updates);
        }

        currentIndex += count;
        distributedTotal += count;
      }
    }

<<<<<<< HEAD
    res.json({ 
      msg: "Success", 
      details: `Distributed ${distributedTotal} leads successfully.` 
=======
    res.json({
      msg: "Success",
      details: `Distributed ${distributedTotal} leads successfully ${batchId ? `from batch ${batchId}` : "from ALL batches"}.`
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
    });

  } catch (err) {
    console.error("Distribution Error:", err);
    res.status(500).send("Server Error");
  }
};

// ✅ --- 5. GET MY ASSIGNED LEADS (OPTIONAL: filter by batch) ---
exports.getMyLeads = async (req, res) => {
  try {
<<<<<<< HEAD
    const leads = await Lead.find({ assignedTo: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100); 
=======
    const filter = { assignedTo: req.user.id };

    // Optional filter: /my-leads?batchId=xxxx
    if (req.query.batchId) {
      filter.batchId = req.query.batchId;
    }

    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);

>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

<<<<<<< HEAD
// --- DASHBOARD STATS ---
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const availableLeads = await Lead.countDocuments({ 
      assignedTo: userId, 
      status: 'New' 
    });

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
=======
// --- 6. DASHBOARD STATS ---
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const availableLeads = await Lead.countDocuments({
      assignedTo: userId,
      status: 'New'
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913

    const callStats = await Lead.aggregate([
      { $match: { "history.by": new mongoose.Types.ObjectId(userId) } },
      { $unwind: "$history" },
      {
        $match: {
          "history.by": new mongoose.Types.ObjectId(userId),
          "history.date": { $gte: startOfDay, $lte: endOfDay }
        }
      },
      { $count: "count" }
    ]);
    const callsToday = callStats.length > 0 ? callStats[0].count : 0;

    const newClients = await Client.find({
      managedBy: userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const conversions = newClients.length;
    const totalCapital = newClients.reduce((sum, client) => sum + (client.investmentCapital || 0), 0);
<<<<<<< HEAD
    const estimatedEarnings = totalCapital * 0.01; 

    res.json({ availableLeads, callsToday, conversions, estimatedEarnings });
=======
    const estimatedEarnings = totalCapital * 0.01;

    res.json({
      availableLeads,
      callsToday,
      conversions,
      estimatedEarnings
    });
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

<<<<<<< HEAD
// --- LOG CALL ---
exports.logCall = async (req, res) => {
  const { leadId, outcome, notes, duration, messageSent } = req.body; 
=======
// --- 7. LOG CALL (Your existing logic - untouched) ---
exports.logCall = async (req, res) => {
  const { leadId, outcome, notes, duration, messageSent } = req.body;
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    const currentUser = req.user.id;

<<<<<<< HEAD
    lead.touchCount = (lead.touchCount || 0) + 1; 
    lead.callCount += 1; 
=======
    lead.touchCount = (lead.touchCount || 0) + 1;

    // ⚠️ NOTE: Your code uses lead.callCount but it's not in schema
    lead.callCount += 1;

>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
    lead.lastCallOutcome = outcome;
    lead.lastCallDate = new Date();

    if (outcome === 'Connected - Interested') lead.status = 'Interested';
    else if (outcome === 'Busy') lead.status = 'Busy';
    else if (outcome === 'Callback') lead.status = 'Callback';
    else if (outcome === 'Ringing') lead.status = 'Ringing';
    else lead.status = 'Contacted';

    lead.history.push({
<<<<<<< HEAD
      action: `Call Attempt #${lead.touchCount}: ${outcome}`, 
=======
      action: `Call Attempt #${lead.touchCount}: ${outcome}`,
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
      by: currentUser,
      date: new Date(),
      details: notes,
      duration: duration || 0,
<<<<<<< HEAD
      messageSent: messageSent || null 
    });

    // --- RECYCLE LOGIC ---
    if (outcome === 'DND' || outcome === 'Wrong Number') {
      lead.status = 'Archived';
      lead.isArchived = true;
      lead.archiveReason = `Permanently Dead: ${outcome} (Marked by Agent)`; 
      lead.assignedTo = null; 
    }
=======
      messageSent: messageSent || null
    });

    // RULE A
    if (outcome === 'DND' || outcome === 'Wrong Number') {
      lead.status = 'Archived';
      lead.isArchived = true;
      lead.archiveReason = `Permanently Dead: ${outcome} (Marked by Agent)`;
      lead.assignedTo = null;
    }

    // RULE B
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
    else if (lead.touchCount >= 8 && lead.status !== 'Interested') {
      const previousOwners = lead.custodyChain.map(entry => entry.assignedTo.toString());
      if (!previousOwners.includes(currentUser)) previousOwners.push(currentUser);

<<<<<<< HEAD
      const freshAgents = await User.find({ 
        role: 'Employee', 
        _id: { $nin: previousOwners } 
=======
      const freshAgents = await User.find({
        role: 'Employee',
        _id: { $nin: previousOwners }
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
      });

      if (freshAgents.length > 0) {
        const randomAgent = freshAgents[Math.floor(Math.random() * freshAgents.length)];
<<<<<<< HEAD
        
        lead.custodyChain.push({
          assignedTo: currentUser,
          assignedBy: currentUser, 
          roleAtTime: 'Employee',
          assignedDate: new Date() 
        });

        lead.assignedTo = randomAgent._id;
        lead.status = 'New'; 
        lead.touchCount = 0; 
        
=======

        lead.custodyChain.push({
          assignedTo: currentUser,
          assignedBy: currentUser,
          roleAtTime: 'Employee',
          assignedDate: new Date()
        });

        lead.assignedTo = randomAgent._id;
        lead.status = 'New';
        lead.touchCount = 0;

>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
        lead.history.push({
          action: 'System Recycle',
          by: currentUser,
          details: `Max touches reached. Recycled to ${randomAgent.name} (Fresh Agent).`,
          date: new Date()
        });

      } else {
        lead.status = 'Archived';
        lead.isArchived = true;
        lead.archiveReason = 'Exhausted: Attempted by all available employees.';
        lead.assignedTo = null;
      }
    }

    await lead.save();
    res.json({ msg: "Call Logged", lead });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// --- 8. GET LIFECYCLE ---
exports.getLeadLifecycle = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('custodyChain.assignedTo', 'name role')
      .populate('custodyChain.assignedBy', 'name role')
      .populate('history.by', 'name role');

    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    res.json(lead);
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

<<<<<<< HEAD
// --- GET DEAD ARCHIVE (Admin Only) ---
exports.getArchivedLeads = async (req, res) => {
  try {
    const archivedLeads = await Lead.find({ isArchived: true })
      .populate('assignedTo', 'name role') 
=======
// --- 9. GET DEAD ARCHIVE ---
exports.getArchivedLeads = async (req, res) => {
  try {
    const archivedLeads = await Lead.find({ isArchived: true })
      .populate('assignedTo', 'name role')
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
      .sort({ updatedAt: -1 });

    res.json(archivedLeads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

<<<<<<< HEAD
// --- ADMIN REASSIGN (God Mode) ---
=======
// --- 10. ADMIN REASSIGN ---
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
exports.adminReassign = async (req, res) => {
  const { leadId, newUserId } = req.body;

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    const adminId = req.user.id;

    lead.custodyChain.push({
<<<<<<< HEAD
      assignedTo: lead.assignedTo, 
=======
      assignedTo: lead.assignedTo,
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
      assignedBy: adminId,
      roleAtTime: 'Admin Override',
      assignedDate: new Date()
    });

    lead.history.push({
      action: 'Admin Override',
      by: adminId,
      details: `Admin forced reassignment to new user.`,
      date: new Date()
    });

    lead.assignedTo = newUserId;
<<<<<<< HEAD
    lead.status = 'New'; 
    lead.touchCount = 0; 
    lead.isArchived = false; 
=======
    lead.status = 'New';
    lead.touchCount = 0;
    lead.isArchived = false;
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
    lead.archiveReason = null;

    await lead.save();
    res.json({ msg: "Lead Reassigned Successfully" });

  } catch (err) {
    res.status(500).send("Server Error");
  }
};
<<<<<<< HEAD

// --- DELETE BATCH (Safe Delete) ---
exports.deleteBatch = async (req, res) => {
  try {
    const batchId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const batch = await UploadBatch.findById(batchId);
    if (!batch) return res.status(404).json({ msg: "File not found" });

    // PERMISSION CHECK
    if (userRole === 'LeadManager') {
      const uploader = await User.findById(batch.uploadedBy);
      if (uploader && uploader.role === 'Admin') {
        return res.status(403).json({ msg: "Access Denied: You cannot delete Admin uploads." });
      }
      if (batch.uploadedBy.toString() !== userId) {
        return res.status(403).json({ msg: "Access Denied: You can only delete your own files." });
      }
    }

    // SAFE DELETE LOGIC (Preserve touched leads)
    const deleteResult = await Lead.deleteMany({ 
      batchId: batchId,
      status: 'New',
      touchCount: 0 
    });

    const remainingLeads = await Lead.countDocuments({ batchId: batchId });

    // Delete the batch record regardless
    await UploadBatch.findByIdAndDelete(batchId);

    res.json({ 
      msg: "Batch Deleted", 
      deletedCount: deleteResult.deletedCount, 
      retainedCount: remainingLeads 
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};
=======
>>>>>>> f3ff2fdb1e88a1b2e301c2af0b34a54619960913
