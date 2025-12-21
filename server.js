require('dotenv').config(); // Load .env file
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db'); 

const app = express();

app.use(express.json());
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174",process.env.FRONTEND_URL], 
  credentials: true
}));

// Connect Database
connectDB();
// Define Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/attendance', require('./src/routes/attendanceRoutes'));
app.use('/api/leads', require('./src/routes/leadRoutes'));
app.use('/api/clients', require('./src/routes/clientRoutes')); 
app.use('/api/ai', require('./src/routes/aiRoutes'));
app.use('/api/tickets', require('./src/routes/ticketRoutes'));
app.use('/api/tasks', require('./src/routes/taskRoutes'));
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
