const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 

// --- LOGIN CONTROLLER ---
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email.trim() });
    if (!user) return res.status(400).json({ msg: "User not found" });

    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      if (user.password === password) {
        isMatch = true;
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
      }
    }

    if (!isMatch) return res.status(400).json({ msg: "Invalid Credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'SECRET_KEY_123',
      { expiresIn: '1d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// --- REGISTER USER CONTROLLER ---
exports.registerUser = async (req, res) => {
  const { name, email, password, role: requestedRole, branch, salary } = req.body;
  const creatorRole = req.user.role;
  const creatorId = req.user.id;

  try {
    let newRole = '';

    if (creatorRole === 'Admin') {
      newRole = requestedRole === 'HR' ? 'HR' : (requestedRole === 'LeadManager' ? 'LeadManager' : 'BranchManager');
    } else if (creatorRole === 'BranchManager' || creatorRole === 'HR') {
      newRole = 'TeamLead';
    } else if (creatorRole === 'TeamLead') {
      newRole = 'Employee';
    } else {
      return res.status(403).json({ msg: "Not authorized" });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    user = new User({
      name,
      email,
      password, 
      role: newRole,
      reportsTo: creatorId,
      branch: typeof branch === 'string' ? branch : '',
      salary: {
        basic: Number(salary?.basic || 0),
        allowances: Number(salary?.allowances || 0),
        deductions: Number(salary?.deductions || 0)
      }
    });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();
    res.json({ msg: `Success! Created ${newRole}: ${name}` });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// --- HELPER CONTROLLERS ---
exports.getMySubordinates = async (req, res) => {
  try {
    const subordinates = await User.find({ reportsTo: req.user.id })
      .select('name email role');
    res.json(subordinates);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

exports.getMyDownlineUsers = async (req, res) => {
  try {
    const myId = req.user.id;
    const queue = [myId];
    const visited = new Set([String(myId)]);
    const result = [];

    while (queue.length > 0) {
      const managerId = queue.shift();
      const directSubs = await User.find({ reportsTo: managerId })
        .select('name email role reportsTo');

      for (const u of directSubs) {
        const uid = String(u._id);
        if (!visited.has(uid)) {
          visited.add(uid);
          result.push(u);
          queue.push(u._id);
        }
      }
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('name email role');
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) return res.status(404).json({ msg: "User not found" });

    await require('../models/Lead').updateMany(
      { assignedTo: userToDelete._id },
      { assignedTo: req.user.id, status: 'New', touchCount: 0 } 
    );

    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: "User deleted. Leads returned to you." });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};