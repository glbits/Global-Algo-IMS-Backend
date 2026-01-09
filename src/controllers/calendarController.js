const CalendarEvent = require('../models/CalendarEvent');
const axios = require('axios');

// 1. GET ALL EVENTS (For the Calendar View)
// Returns all active events + global holidays that HR hasn't deleted
exports.getEvents = async (req, res) => {
  try {
    const events = await CalendarEvent.find({ isDeletedByHR: { $ne: true } })
      .populate('createdBy', 'name');
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// 2. ADD EVENT (For Manual HR Inputs)
exports.addEvent = async (req, res) => {
  try {
    const { title, date, type, description } = req.body;
    const newEvent = new CalendarEvent({
      title,
      date,
      type, // 'Holiday', 'Meeting', etc.
      description,
      createdBy: req.user.id,
      isGlobal: false // Manual events are not global system holidays
    });
    await newEvent.save();
    res.json(newEvent);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to save event");
  }
};

// 3. SYNC INDIAN HOLIDAYS (The Auto-Import Button)
exports.syncIndianHolidays = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    // Fetch official Indian Holidays
    const response = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/IN`);
    
    const holidays = response.data.map(h => ({
      title: h.localName,
      date: h.date,
      type: 'Holiday',
      isGlobal: true, 
      description: h.name
    }));

    // Upsert to avoid duplicates
    for (const holiday of holidays) {
      await CalendarEvent.findOneAndUpdate(
        { date: holiday.date, title: holiday.title },
        { ...holiday, isDeletedByHR: false }, 
        { upsert: true }
      );
    }

    res.json({ msg: `Imported ${holidays.length} Indian Holidays.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "API Sync Failed" });
  }
};

// 4. DELETE EVENT (Soft Delete for System Holidays, Hard Delete for Manual)
exports.deleteEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ msg: "Not found" });

    // If it's a "Global" holiday (from the API), we just hide it
    if (event.isGlobal) {
      event.isDeletedByHR = true;
      await event.save();
    } else {
      // If it's a manual event, we delete it from DB
      await CalendarEvent.findByIdAndDelete(req.params.id);
    }
    
    res.json({ msg: "Event removed" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};