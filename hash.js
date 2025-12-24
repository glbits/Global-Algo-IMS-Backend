const bcrypt = require('bcryptjs');

async function getHash() {
    const password = "admin"; // Type your desired password here
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    console.log("Copy this into MongoDB:", hashed);
}

getHash();