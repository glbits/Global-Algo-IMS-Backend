const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const UploadBatch = require('../models/UploadBatch'); 
const Client = require('../models/Client');
const Task = require('../models/Task');

// --- HELPER: PHONE CLEANING ---
const cleanPhoneNumber = (raw) => {
  if (!raw) return null;
  
  // Remove non-numeric chars
  let clean = String(raw).replace(/\D/g, ''); 

  // Handle India Code (91) - remove if present at start
  if (clean.length > 10 && clean.startsWith('91')) {
    clean = clean.substring(2);
  }
  
  // Handle leading 0
  if (clean.length > 10 && clean.startsWith('0')) {
    clean = clean.substring(1);
  }

  // Must be exactly 10 digits
  return clean.length === 10 ? clean : null;
};

// --- 1. UPLOAD LEADS (WITH BATCHING) ---
exports.uploadLeads = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "No file uploaded" });
    }

    // A. Create a Batch Record
    const newBatch = new UploadBatch({
      fileName: req.file.originalname,
      uploadedBy: req.user.id,
      totalCount: 0
    });
    const savedBatch = await newBatch.save();

    // B. Read Excel/CSV File
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Get data as array of arrays
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // C. Process Rows
    const validLeads = [];
    const seenNumbers = new Set(); 

    for (const row of rawRows) {
      if (!row || row.length === 0) continue;

      const rawPhone = row[0];
      const rawName = row[1];

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
          }
        });
      }
    }

    // D. Handle Empty/Invalid File
    if (validLeads.length === 0) {
      await UploadBatch.findByIdAndDelete(savedBatch._id);
      return res.status(400).json({ msg: "No valid phone numbers found. Ensure Column A has numbers." });
    }

    // E. Bulk Insert to DB
    try {
      await Lead.insertMany(validLeads, { ordered: false });
      
      savedBatch.totalCount = validLeads.length;
      await savedBatch.save();

      res.json({ msg: `Success! Batch '${req.file.originalname}' created with ${validLeads.length} leads.` });

    } catch (insertError) {
      if (insertError.writeErrors) {
        const insertedCount = insertError.insertedDocs.length;
        savedBatch.totalCount = insertedCount;
        await savedBatch.save();

        res.json({ msg: `Imported ${insertedCount} leads (Skipped ${validLeads.length - insertedCount} duplicates).` });
      } else {
        throw insertError;
      }
    }

  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ msg: "Server Error during Upload" });
  }
};

// --- 2. GET UPLOAD HISTORY (List of Files) ---
exports.getUploadBatches = async (req, res) => {
  try {
    const batches = await UploadBatch.find()
      .sort({ uploadDate: -1 }) 
      .populate('uploadedBy', 'name role'); // CORRECT: Includes role for the "Me" check
    res.json(batches);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// --- 3. GET LEADS FOR A SPECIFIC FILE ---
exports.getBatchDetails = async (req, res) => {
  try {
    const leads = await Lead.find({ batchId: req.params.id });
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// --- 4. DISTRIBUTE LEADS ---
exports.distributeLeads = async (req, res) => {
  const { assignments } = req.body;

  try {
    const distributorId = req.user.id;
    const distributorRole = req.user.role; 

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ msg: "No distribution data provided." });
    }

    const totalRequested = assignments.reduce((sum, item) => sum + Number(item.count), 0);

    const availableLeads = await Lead.find({ 
      assignedTo: distributorId, 
      status: 'New' 
    });

    if (availableLeads.length < totalRequested) {
      return res.status(400).json({ 
        msg: `Insufficient leads. You have ${availableLeads.length}, but tried to distribute ${totalRequested}.` 
      });
    }

    let currentIndex = 0;
    let distributedTotal = 0;

    for (const assignment of assignments) {
      const count = Number(assignment.count);
      
      if (count > 0) {
        const batch = availableLeads.slice(currentIndex, currentIndex + count);
        const batchIds = batch.map(l => l._id);

        const updates = batchIds.map(id => ({
          updateOne: {
            filter: { _id: id },
            update: { 
              $set: { assignedTo: assignment.userId },
              $push: { 
                custodyChain: {
                  assignedTo: assignment.userId,
                  assignedBy: distributorId,
                  roleAtTime: distributorRole,
                  assignedDate: new Date()
                },
                history: {
                  action: 'Assignment',
                  by: distributorId,
                  details: `Passed to ${assignment.userId} by ${distributorRole}`,
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

    res.json({ 
      msg: "Success", 
      details: `Distributed ${distributedTotal} leads successfully.` 
    });

  } catch (err) {
    console.error("Distribution Error:", err);
    res.status(500).send("Server Error");
  }
};

// --- 5. GET MY ASSIGNED LEADS ---
exports.getMyLeads = async (req, res) => {
  try {
    const leads = await Lead.find({ assignedTo: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100); 
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

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

    const callStats = await Lead.aggregate([
      { $match: { "history.by": new mongoose.Types.ObjectId(userId) } },
      { $unwind: "$history" },
      { $match: { 
          "history.by": new mongoose.Types.ObjectId(userId),
          "history.date": { $gte: startOfDay, $lte: endOfDay }
      }},
      { $count: "count" }
    ]);
    const callsToday = callStats.length > 0 ? callStats[0].count : 0;

    const newClients = await Client.find({
      managedBy: userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const conversions = newClients.length;
    const totalCapital = newClients.reduce((sum, client) => sum + (client.investmentCapital || 0), 0);
    const estimatedEarnings = totalCapital * 0.01; 

    res.json({ availableLeads, callsToday, conversions, estimatedEarnings });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// --- LOG CALL ---
exports.logCall = async (req, res) => {
  const { leadId, outcome, notes, duration, messageSent } = req.body; 

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    const currentUser = req.user.id;

    lead.touchCount = (lead.touchCount || 0) + 1; 
    lead.callCount += 1; 
    lead.lastCallOutcome = outcome;
    lead.lastCallDate = new Date();

    if (outcome === 'Connected - Interested') lead.status = 'Interested';
    else if (outcome === 'Busy') lead.status = 'Busy';
    else if (outcome === 'Callback') lead.status = 'Callback';
    else if (outcome === 'Ringing') lead.status = 'Ringing';
    else lead.status = 'Contacted';

    lead.history.push({
      action: `Call Attempt #${lead.touchCount}: ${outcome}`, 
      by: currentUser,
      date: new Date(),
      details: notes,
      duration: duration || 0,
      messageSent: messageSent || null 
    });

    // --- RECYCLE LOGIC ---
    if (outcome === 'DND' || outcome === 'Wrong Number') {
      lead.status = 'Archived';
      lead.isArchived = true;
      lead.archiveReason = `Permanently Dead: ${outcome} (Marked by Agent)`; 
      lead.assignedTo = null; 
    }
    else if (lead.touchCount >= 8 && lead.status !== 'Interested') {
      const previousOwners = lead.custodyChain.map(entry => entry.assignedTo.toString());
      if (!previousOwners.includes(currentUser)) previousOwners.push(currentUser);

      const freshAgents = await User.find({ 
        role: 'Employee', 
        _id: { $nin: previousOwners } 
      });

      if (freshAgents.length > 0) {
        const randomAgent = freshAgents[Math.floor(Math.random() * freshAgents.length)];
        
        lead.custodyChain.push({
          assignedTo: currentUser,
          assignedBy: currentUser, 
          roleAtTime: 'Employee',
          assignedDate: new Date() 
        });

        lead.assignedTo = randomAgent._id;
        lead.status = 'New'; 
        lead.touchCount = 0; 
        
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

// --- GET DEAD ARCHIVE (Admin Only) ---
exports.getArchivedLeads = async (req, res) => {
  try {
    const archivedLeads = await Lead.find({ isArchived: true })
      .populate('assignedTo', 'name role') 
      .sort({ updatedAt: -1 });

    res.json(archivedLeads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// --- ADMIN REASSIGN (God Mode) ---
exports.adminReassign = async (req, res) => {
  const { leadId, newUserId } = req.body;

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    const adminId = req.user.id;

    lead.custodyChain.push({
      assignedTo: lead.assignedTo, 
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
    lead.status = 'New'; 
    lead.touchCount = 0; 
    lead.isArchived = false; 
    lead.archiveReason = null;

    await lead.save();
    res.json({ msg: "Lead Reassigned Successfully" });

  } catch (err) {
    res.status(500).send("Server Error");
  }
};

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