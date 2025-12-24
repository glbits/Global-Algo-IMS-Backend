const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // IMPORANT: Ensure this is installed

// --- LOGIN CONTROLLER ---
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find User
    const user = await User.findOne({ email: email.trim() });

    if (!user) {
      return res.status(400).json({ msg: "User not found" });
    }

    // 2. PASSWORD CHECK (Handles both Hashed and Legacy Plain Text)
    let isMatch = false;

    // A. Check if the stored password is hashed (bcrypt hashes start with $2a$ or $2b$)
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      // Compare using bcrypt
      isMatch = await bcrypt.compare(password, user.password);
    } 
    else {
      // B. Fallback: Check plain text (For your existing Admin user)
      if (user.password === password) {
        isMatch = true;
        
        // SECURITY UPGRADE: Automatically hash it now so it's secure next time
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        console.log(`🔒 Security Update: Password for ${user.email} has been hashed.`);
      }
    }

    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // 3. Generate Token
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
  const { name, email, password } = req.body;
  const creatorRole = req.user.role;
  const creatorId = req.user.id;

  try {
    // 1. Role Hierarchy Check
    let newRole = '';
    if (creatorRole === 'Admin') newRole = 'BranchManager';
    else if (creatorRole === 'BranchManager') newRole = 'TeamLead';
    else if (creatorRole === 'TeamLead') newRole = 'Employee';
    else return res.status(403).json({ msg: "You are not authorized to create users." });

    // 2. Check Duplicate
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    // 3. Create Instance
    user = new User({
      name,
      email,
      password, // Temporarily plain text, hashed below
      role: newRole,
      reportsTo: creatorId
    });

    // 4. ENCRYPT PASSWORD
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // 5. Save to DB
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

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('name email role');
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
};