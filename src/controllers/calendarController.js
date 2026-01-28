const CalendarEvent = require('../models/CalendarEvent');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Load offline holiday list (fallback)
function loadOfflineIndiaHolidays(year) {
  try {
    const filePath = path.join(__dirname, '..', 'data', `india-holidays-${year}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.error('Offline holiday JSON load failed:', e);
    return null;
  }
}

// ------------------------------------------------------
// GET EVENTS
// ------------------------------------------------------
exports.getEvents = async (req, res) => {
  try {
    const events = await CalendarEvent.find({
      isDeletedByHR: { $ne: true },
      $or: [
        { type: { $ne: 'Holiday' } },
        { type: 'Holiday', countryCode: 'IN' }
      ]
    }).populate('createdBy', 'name');

    res.json(events);
  } catch (err) {
    console.error('getEvents error:', err);
    res.status(500).send('Server Error');
  }
};

// ------------------------------------------------------
// ADD EVENT
// ------------------------------------------------------
exports.addEvent = async (req, res) => {
  try {
    const { title, date, type, description } = req.body;

    if (!title || !date) {
      return res.status(400).json({ msg: 'title and date are required' });
    }

    const finalType = type || 'Holiday';

    const eventDoc = {
      title,
      date,
      type: finalType,
      description,
      createdBy: req.user.id,
      isGlobal: false
    };

    if (finalType === 'Holiday') {
      eventDoc.countryCode = 'IN';
    }

    const newEvent = new CalendarEvent(eventDoc);
    await newEvent.save();

    res.json(newEvent);
  } catch (err) {
    console.error('addEvent error:', err);
    res.status(500).send('Failed to save event');
  }
};

// ------------------------------------------------------
// SYNC INDIAN HOLIDAYS (ONLINE + OFFLINE FALLBACK)
// ------------------------------------------------------
exports.syncIndianHolidays = async (req, res) => {
  const year = new Date().getFullYear();
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/IN`;

  try {
    console.log('Syncing holidays from:', url);

    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Global-Algo-IMS)'
      },
      validateStatus: (status) => status >= 200 && status < 500
    });

    console.log('Holiday API status:', response.status);

    // ✅ If API gives 200 + array => use it
    if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
      const holidays = response.data.map((h) => ({
        title: h.localName || h.name || 'Holiday',
        date: h.date,
        type: 'Holiday',
        isGlobal: true,
        countryCode: 'IN',
        description: h.name || h.localName || '',
        isDeletedByHR: false
      }));

      for (const holiday of holidays) {
        await CalendarEvent.findOneAndUpdate(
          { date: holiday.date, title: holiday.title },
          holiday,
          { upsert: true, new: true }
        );
      }

      return res.json({ msg: `Imported ${holidays.length} Indian Holidays (API).` });
    }

    // ✅ If 204 OR non-array OR empty => fallback to offline JSON
    console.log('Holiday API did not return holidays. Falling back to offline JSON.');

    const offline = loadOfflineIndiaHolidays(year);
    if (!offline) {
      return res.status(500).json({
        msg: `Holiday API returned no data (status ${response.status}). Offline file not found: src/data/india-holidays-${year}.json`
      });
    }

    const holidays = offline.map((h) => ({
      title: h.localName || h.name || 'Holiday',
      date: h.date,
      type: 'Holiday',
      isGlobal: true,
      countryCode: 'IN',
      description: h.name || h.localName || '',
      isDeletedByHR: false
    }));

    for (const holiday of holidays) {
      await CalendarEvent.findOneAndUpdate(
        { date: holiday.date, title: holiday.title },
        holiday,
        { upsert: true, new: true }
      );
    }

    return res.json({ msg: `Imported ${holidays.length} Indian Holidays (Offline).` });
  } catch (err) {
    console.error('syncIndianHolidays error:', err?.message || err);

    // Offline fallback also on network failure
    const offline = loadOfflineIndiaHolidays(year);
    if (!offline) {
      return res.status(500).json({
        msg: `Holiday API failed and offline file missing: src/data/india-holidays-${year}.json`,
        error: err?.message || 'unknown'
      });
    }

    const holidays = offline.map((h) => ({
      title: h.localName || h.name || 'Holiday',
      date: h.date,
      type: 'Holiday',
      isGlobal: true,
      countryCode: 'IN',
      description: h.name || h.localName || '',
      isDeletedByHR: false
    }));

    for (const holiday of holidays) {
      await CalendarEvent.findOneAndUpdate(
        { date: holiday.date, title: holiday.title },
        holiday,
        { upsert: true, new: true }
      );
    }

    return res.json({ msg: `Imported ${holidays.length} Indian Holidays (Offline - API failed).` });
  }
};

// ------------------------------------------------------
// DELETE EVENT
// ------------------------------------------------------
exports.deleteEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ msg: 'Not found' });

    if (event.isGlobal) {
      event.isDeletedByHR = true;
      await event.save();
    } else {
      await CalendarEvent.findByIdAndDelete(req.params.id);
    }

    res.json({ msg: 'Event removed' });
  } catch (err) {
    console.error('deleteEvent error:', err);
    res.status(500).send('Server Error');
  }
};
