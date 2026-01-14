// src/utils/dateUtils.js

const getISTDate = () => {
  // Returns Date object adjusted to IST
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 5.5)); // +5.5 hours
};

const getTodayDateString = () => {
  // Returns "YYYY-MM-DD" string strictly based on IST
  const istDate = getISTDate();
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const day = String(istDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

module.exports = { getISTDate, getTodayDateString };