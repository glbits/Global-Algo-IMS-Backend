const Ticket = require('../models/Ticket');

// 1. RAISE TICKET (Automatic Routing Logic)
exports.createTicket = async (req, res) => {
  try {
    const { category, priority, subject, description } = req.body;
    const userRole = req.user.role;

    // --- ROUTING LOGIC ---
    let recipient = 'BranchManager'; // Default

    // Rule 1: If Priority is High -> Go to Admin
    if (priority === 'High') {
      recipient = 'Admin';
    }
    // Rule 2: If Branch Manager is raising it -> Go to Admin
    else if (userRole === 'BranchManager') {
      recipient = 'Admin';
    }
    // Rule 3: Admin raising ticket -> Keeps it (or Self)
    else if (userRole === 'Admin') {
      recipient = 'Admin';
    }
    // Else: Stays 'BranchManager' (for Low/Medium tickets from Agents/TLs)

    const newTicket = new Ticket({
      createdBy: req.user.id,
      recipient, // Auto-calculated
      category,
      priority,
      subject,
      description
    });

    await newTicket.save();
    res.json({ msg: "Ticket Raised Successfully." });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

// 2. GET TICKETS (Visibility Logic)
exports.getTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    // SCENARIO A: ADMIN (GOD MODE) -> Sees EVERYTHING
    if (role === 'Admin') {
      const tickets = await Ticket.find({})
        .populate('createdBy', 'name role email')
        .sort({ createdAt: -1 });
      return res.json(tickets);
    }

    // SCENARIO B: BRANCH MANAGER 
    // Sees: 1. Tickets assigned TO them. 2. Tickets created BY them.
    if (role === 'BranchManager') {
      const tickets = await Ticket.find({
        $or: [
          { recipient: 'BranchManager' }, // Incoming
          { createdBy: userId }           // Outgoing
        ]
      })
      .populate('createdBy', 'name role email')
      .sort({ createdAt: -1 });
      return res.json(tickets);
    }

    // SCENARIO C: EMPLOYEE/TL (See only their OWN raised tickets)
    const myTickets = await Ticket.find({ createdBy: userId })
      .populate('createdBy', 'name role') // Just for consistency
      .sort({ createdAt: -1 });
    res.json(myTickets);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// 3. RESOLVE TICKET (With Inputs)
exports.resolveTicket = async (req, res) => {
  try {
    const { resolutionDetails } = req.body;

    if (!resolutionDetails) {
      return res.status(400).json({ msg: "Please provide resolution details." });
    }

    // Only Admin and BM can resolve
    if (req.user.role !== 'Admin' && req.user.role !== 'BranchManager') {
      return res.status(403).json({ msg: "Access Denied" });
    }
    
    await Ticket.findByIdAndUpdate(req.params.id, { 
      status: 'Resolved',
      resolutionDetails: resolutionDetails,
      resolvedBy: req.user.id,
      resolvedDate: new Date()
    });

    res.json({ msg: "Ticket Resolved" });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};