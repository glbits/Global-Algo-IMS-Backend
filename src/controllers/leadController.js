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

    // A. Create a Batch Record (The "Folder" for this upload)
    const newBatch = new UploadBatch({
      fileName: req.file.originalname,
      uploadedBy: req.user.id,
      totalCount: 0 // We will update this after counting valid leads
    });
    const savedBatch = await newBatch.save();

    // B. Read Excel File
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    // C. Process Rows
    const validLeads = [];
    const seenNumbers = new Set(); 

    for (const row of rawData) {
      // Check multiple possible header names
      const rawPhone = row['Phone Number'] || row['Raw Phone'] || row['PhoneNumber'];
      const cleanPhone = cleanPhoneNumber(rawPhone);

      // Only add valid, unique (within file) numbers
      if (cleanPhone && !seenNumbers.has(cleanPhone)) {
        seenNumbers.add(cleanPhone);
        
        validLeads.push({
          phoneNumber: cleanPhone,
          name: row['Source File'] || row['Name'] || "Unknown Source", 
          assignedTo: req.user.id, // Assigned to Uploader (Admin) initially
          status: 'New',
          batchId: savedBatch._id, // LINK TO THE BATCH
          data: {
            originalRaw: rawPhone,
            sNo: row['S.No']
          }
        });
      }
    }

    // D. Handle Empty/Invalid File
    if (validLeads.length === 0) {
      await UploadBatch.findByIdAndDelete(savedBatch._id); // Cleanup empty batch
      return res.status(400).json({ msg: "No valid phone numbers found in file." });
    }

    // E. Bulk Insert to DB
    try {
      // ordered: false ensures that if one duplicate fails, the rest continue
      await Lead.insertMany(validLeads, { ordered: false });
      
      // Update the Batch count with the actual number of leads
      savedBatch.totalCount = validLeads.length;
      await savedBatch.save();

      res.json({ msg: `Success! Batch '${req.file.originalname}' created with ${validLeads.length} leads.` });

    } catch (insertError) {
      // If some failed due to duplicates, calculate how many actually succeeded
      if (insertError.writeErrors) {
        const insertedCount = insertError.insertedDocs.length;
        
        // Update batch count to reflect only successful inserts
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

    // 1. Validate: Do we have assignments?
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ msg: "No distribution data provided." });
    }

    // 2. Calculate Total Requested
    const totalRequested = assignments.reduce((sum, item) => sum + Number(item.count), 0);

    // 3. Check Available Leads
    const availableLeads = await Lead.find({ 
      assignedTo: distributorId,
      status: 'New' 
    });

    if (availableLeads.length < totalRequested) {
      return res.status(400).json({ 
        msg: `Insufficient leads. You have ${availableLeads.length}, but tried to distribute ${totalRequested}.` 
      });
    }

    // 4. Distribution Loop
    let currentIndex = 0;
    let distributedTotal = 0;

    for (const assignment of assignments) {
      const count = Number(assignment.count);
      if (count > 0) {
        // Slice the exact number of leads for this user
        const batch = availableLeads.slice(currentIndex, currentIndex + count);
        const batchIds = batch.map(l => l._id);

        // Update DB
        await Lead.updateMany(
          { _id: { $in: batchIds } },
          { $set: { assignedTo: assignment.userId } }
        );

        currentIndex += count;
        distributedTotal += count;
      }
    }

    res.json({ 
      msg: "Success", 
      details: `Distributed ${distributedTotal} leads successfully.` 
    });

  } catch (err) {
    console.error(err);
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
  const { leadId, outcome, notes } = req.body;
  // outcome: 'Ringing', 'Not Interested', 'Callback', etc.

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    // Update Lead Data
    lead.status = outcome === 'Not Interested' ? 'Rejected' : 'Contacted'; // Simple logic for now
    if (outcome === 'Ringing' || outcome === 'Callback') lead.status = outcome;
    
    lead.callCount += 1;
    lead.lastCallOutcome = outcome;
    lead.lastCallDate = new Date();

    // Add to History
    lead.history.push({
      action: `Call Logged: ${outcome}`,
      by: req.user.id,
      date: new Date(),
      details: notes
    });

    await lead.save();
    res.json({ msg: "Call Logged Successfully", lead });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};




exports.logCall = async (req, res) => {
  const { leadId, outcome, notes, duration, messageSent } = req.body; // Added duration/messageSent

  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    // Status Logic
    if (outcome === 'Connected - Interested') lead.status = 'Interested';
    else if (outcome === 'DND') lead.status = 'Rejected';
    else if (outcome === 'Busy') lead.status = 'Callback';
    else lead.status = 'Contacted';

    lead.callCount += 1;
    lead.lastCallOutcome = outcome;
    lead.lastCallDate = new Date();

    lead.history.push({
      action: `Call: ${outcome}`,
      by: req.user.id,
      date: new Date(),
      details: notes,
      duration: duration || 0,
      messageSent: messageSent || null
    });

    await lead.save();
    res.json({ msg: "Call Logged Successfully", lead });

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

    // 1. UPDATE LEAD STATUS (Existing Logic)
    if (outcome === 'Connected - Interested') lead.status = 'Interested';
    else if (outcome === 'DND') lead.status = 'Rejected';
    else if (outcome === 'Busy') lead.status = 'Callback';
    else lead.status = 'Contacted';

    lead.callCount += 1;
    lead.lastCallOutcome = outcome;
    lead.lastCallDate = new Date();

    lead.history.push({
      action: `Call: ${outcome}`,
      by: req.user.id,
      date: new Date(),
      details: notes,
      duration: duration || 0,
      messageSent: messageSent || null
    });

    await lead.save();

    // 2. NEW: AUTO-CREATE TASK FOR CALLBACKS
    if (outcome === 'Busy' || outcome === 'Callback' || outcome === 'Ringing') {
      const nextDay = new Date();
      nextDay.setHours(nextDay.getHours() + 24); // Default: Remind in 24 hours

      await Task.create({
        title: `Follow-up: ${lead.name}`,
        description: `Auto-generated reminder. Last outcome: ${outcome}. Notes: ${notes}`,
        assignedBy: req.user.id, // Self-assigned
        assignedTo: req.user.id, // Self-assigned
        type: 'System-Callback',
        priority: 'High',
        relatedLead: lead._id,
        dueDate: nextDay
      });
    }

    res.json({ msg: "Call Logged", lead });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};