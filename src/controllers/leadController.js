const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const UploadBatch = require('../models/UploadBatch'); // Ensure this model exists
const Client = require('../models/Client');
const Task = require('../models/Task')

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

    // CRITICAL CHANGE: Use 'header: 1' to get data as an array of arrays
    // Result: [ ["9876543210", "John Doe"], ["9123456789", "Jane"] ]
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // C. Process Rows
    const validLeads = [];
    const seenNumbers = new Set(); 

    for (const row of rawRows) {
      // row[0] is Column A (Phone), row[1] is Column B (Name)
      
      // Safety check: Skip empty rows
      if (!row || row.length === 0) continue;

      const rawPhone = row[0];
      const rawName = row[1];

      // Clean the phone number
      const cleanPhone = cleanPhoneNumber(rawPhone);

      // Check if it's a valid number AND not a duplicate in this file
      // Also filters out the "Header" row if it exists (since "Phone" isn't a number)
      if (cleanPhone && !seenNumbers.has(cleanPhone)) {
        seenNumbers.add(cleanPhone);
        
        validLeads.push({
          phoneNumber: cleanPhone,
          name: rawName || "Unknown", // Default to Unknown if name is empty
          assignedTo: req.user.id,    // Assigned to Admin initially
          status: 'New',
          batchId: savedBatch._id,
          data: {
            originalRaw: rawPhone
            // We removed sNo since the new file doesn't seem to have it
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
      // ordered: false ensures duplicates don't stop the whole process
      await Lead.insertMany(validLeads, { ordered: false });
      
      savedBatch.totalCount = validLeads.length;
      await savedBatch.save();

      res.json({ msg: `Success! Batch '${req.file.originalname}' created with ${validLeads.length} leads.` });

    } catch (insertError) {
      if (insertError.writeErrors) {
        // Some duplicates failed, but valid ones were inserted
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
      .sort({ uploadDate: -1 }) // Newest first
      .populate('uploadedBy', 'name'); // Include uploader's name
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

// --- 4. DISTRIBUTE LEADS (Waterfall Logic) ---
exports.distributeLeads = async (req, res) => {
  const { assignments } = req.body;
  // Expected Payload: 
  // assignments: [ { userId: "123", count: 10 }, { userId: "456", count: 50 } ]

  try {
    const distributorId = req.user.id;
    const distributorRole = req.user.role; // e.g., 'Admin', 'BranchManager'

    // 1. Validate: Do we have assignments?
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ msg: "No distribution data provided." });
    }

    // 2. Calculate Total Requested
    const totalRequested = assignments.reduce((sum, item) => sum + Number(item.count), 0);

    // 3. Check Available Leads
    // We look for leads currently assigned to the logged-in user that are 'New'
    const availableLeads = await Lead.find({ 
      assignedTo: distributorId, 
      status: 'New' 
    });

    if (availableLeads.length < totalRequested) {
      return res.status(400).json({ 
        msg: `Insufficient leads. You have ${availableLeads.length}, but tried to distribute ${totalRequested}.` 
      });
    }

    // 4. Distribution Loop with Forensic Tracking
    let currentIndex = 0;
    let distributedTotal = 0;

    for (const assignment of assignments) {
      const count = Number(assignment.count);
      
      if (count > 0) {
        // Slice the exact number of leads for this user from the available pool
        const batch = availableLeads.slice(currentIndex, currentIndex + count);
        const batchIds = batch.map(l => l._id);

        // Prepare Bulk Operations
        // We use bulkWrite because we are pushing specific data to arrays, which is safer than updateMany for complex objects
        const updates = batchIds.map(id => ({
          updateOne: {
            filter: { _id: id },
            update: { 
              $set: { assignedTo: assignment.userId },
              $push: { 
                // TRACKING: Add entry to Chain of Custody
                custodyChain: {
                  assignedTo: assignment.userId,
                  assignedBy: distributorId,
                  roleAtTime: distributorRole,
                  assignedDate: new Date()
                },
                // TRACKING: Add entry to History Timeline
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

        // Execute the updates for this batch
        if (updates.length > 0) {
          await Lead.bulkWrite(updates);
        }

        // Move the index forward for the next user in the assignment list
        currentIndex += count;
        distributedTotal += count;
      }
    }

    res.json({ 
      msg: "Success", 
      details: `Distributed ${distributedTotal} leads successfully with tracking.` 
    });

  } catch (err) {
    console.error("Distribution Error:", err);
    res.status(500).send("Server Error");
  }
};

// --- 5. GET MY ASSIGNED LEADS ---
exports.getMyLeads = async (req, res) => {
  try {
    // Fetch leads assigned to the logged-in user, sorted by newest
    const leads = await Lead.find({ assignedTo: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100); 

    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. Get Available Leads (Existing Logic)
    const availableLeads = await Lead.countDocuments({ 
      assignedTo: userId, 
      status: 'New' 
    });

    // 2. Calculate "Calls Today"
    // We look for leads where 'history.by' is ME and 'history.date' is TODAY
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // This aggregate pipeline counts how many history entries match criteria
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

    // 3. Calculate "Conversions" & "Earnings" (From Clients)
    const newClients = await Client.find({
      managedBy: userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const conversions = newClients.length;
    
    // Logic: Sum of Capital * 1% (Adjust this formula as needed)
    const totalCapital = newClients.reduce((sum, client) => sum + (client.investmentCapital || 0), 0);
    const estimatedEarnings = totalCapital * 0.01; // Example: 1% Commission

    res.json({ 
      availableLeads,
      callsToday,
      conversions,
      estimatedEarnings
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};


exports.logCall = async (req, res) => {
  const { leadId, outcome, notes, duration, messageSent } = req.body; 

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    // 1. INCREMENT TOUCHES (Forensic Tracking)
    lead.touchCount = (lead.touchCount || 0) + 1;
    lead.callCount += 1; 
    lead.lastCallOutcome = outcome;
    lead.lastCallDate = new Date();

    // 2. STATUS LOGIC (Based on Outcome)
    if (outcome === 'Connected - Interested') {
        lead.status = 'Interested';
    } else if (outcome === 'DND' || outcome === 'Wrong Number') {
        lead.status = 'Rejected'; // Or 'Archived' immediately
    } else if (outcome === 'Busy') {
        lead.status = 'Busy';
    } else if (outcome === 'Callback') {
        lead.status = 'Callback';
    } else if (outcome === 'Ringing') {
        lead.status = 'Ringing';
    } else {
        lead.status = 'Contacted';
    }

    // 3. ARCHIVE LOGIC (The 8-Touch Rule)
    // Rule A: Immediate Kill
    if (outcome === 'DND' || outcome === 'Wrong Number') {
      lead.status = 'Archived';
      lead.isArchived = true;
      lead.archiveReason = `Immediate Dump: ${outcome}`;
    }
    // Rule B: 8-Touch Limit
    else if (lead.touchCount >= 8 && lead.status !== 'Interested' && lead.status !== 'Closed') {
      lead.status = 'Archived';
      lead.isArchived = true;
      lead.archiveReason = 'Exceeded 8 Touches without conversion';
    }

    // 4. LOG HISTORY (The Timeline)
    lead.history.push({
      action: `Call Attempt #${lead.touchCount}: ${outcome}`,
      by: req.user.id,
      date: new Date(),
      details: notes,
      duration: duration || 0,
      messageSent: messageSent || null
    });

    await lead.save();

    // 5. AUTO-TASK CREATION (The Follow-up Assurance)
    // If the lead requested a callback or was busy, create a Task so the agent doesn't forget.
    if (outcome === 'Busy' || outcome === 'Callback' || outcome === 'Ringing') {
      const nextDay = new Date();
      nextDay.setHours(nextDay.getHours() + 24); // Default: Remind in 24 hours

      await Task.create({
        title: `Follow-up: ${lead.name}`,
        description: `Auto-generated. Last outcome: ${outcome}. Notes: ${notes}`,
        assignedBy: req.user.id, // Self-assigned
        assignedTo: req.user.id, // Self-assigned
        type: 'System-Callback',
        priority: 'High',
        relatedLead: lead._id,
        dueDate: nextDay
      });
    }

    res.json({ msg: "Call Logged Successfully", lead });

  } catch (err) {
    console.error("Log Call Error:", err);
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
    // Fetch leads where isArchived is true
    const archivedLeads = await Lead.find({ isArchived: true })
      .populate('assignedTo', 'name role') // See who had it last
      .sort({ updatedAt: -1 }); // Most recently died first

    res.json(archivedLeads);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};