const User = require('../models/User');
const jwt = require('jsonwebtoken');
// const bcrypt = require('bcryptjs'); // Enable this if you are hashing passwords

exports.login = async (req, res) => {
  const { email, password } = req.body;

  console.log("--------------------------------");
  console.log("LOGIN ATTEMPT:");
  console.log("Input Email:", `"${email}"`); // Quotes help see spaces
  console.log("Input Password:", `"${password}"`);

  try {
    // DIAGNOSTIC: Print ALL users in the DB
    const allUsers = await User.find({});
    console.log("--- DEBUG: ALL USERS IN DB ---");
    console.log(`Found ${allUsers.length} users.`);
    allUsers.forEach(u => {
        console.log(`ID: ${u._id} | Email: "${u.email}" | Pass: "${u.password}"`);
    });
    console.log("------------------------------");

    // Standard Login Logic
    const user = await User.findOne({ email: email.trim() }); // Added trim() fix

    if (!user) {
      console.log("❌ ERROR: User still not found via query.");
      return res.status(400).json({ msg: "User not found" });
    }

    if (password !== user.password) {
      console.log("❌ ERROR: Password mismatch.");
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

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

exports.registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  const creatorRole = req.user.role;
  const creatorId = req.user.id;

  try {
    // 1. Determine Role based on Creator
    let newRole = '';
    if (creatorRole === 'Admin') newRole = 'BranchManager';
    else if (creatorRole === 'BranchManager') newRole = 'TeamLead'; // CHANGED from HR
    else if (creatorRole === 'TeamLead') newRole = 'Employee';
    else return res.status(403).json({ msg: "You are not authorized to create users." });

    // 2. Check if user exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    // 3. Create User linked to Creator
    user = new User({
      name,
      email,
      password, // Hash this in production!
      role: newRole,
      reportsTo: creatorId
    });

    await user.save();
    res.json({ msg: `Success! Created ${newRole}: ${name}` });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};


exports.getMySubordinates = async (req, res) => {
  try {
    const subordinates = await User.find({ reportsTo: req.user.id })
      .select('name email role'); // Only send necessary info
    res.json(subordinates);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};



exports.getAllUsers = async (req, res) => {
  try {
    // Return ID, Name, and Role
    const users = await User.find().select('name email role');
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
};