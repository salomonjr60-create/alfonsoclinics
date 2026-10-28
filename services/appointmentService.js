const db = require("../data/db");

const insertBooking = db.prepare(`
  INSERT INTO appointments (
    specialty,
    doctor,
    appointmentDateTime,
    patientName,
    patientPhone,
    patientEmail,
    status
  ) VALUES (?, ?, ?, ?, ?, ?, 'Pending')
`);
const selectBookingById = db.prepare("SELECT * FROM appointments WHERE id = ?");
const selectBookingByStripeSessionId = db.prepare(
  "SELECT * FROM appointments WHERE stripeSessionId = ?",
);
const setStripeSessionIdForBooking = db.prepare(
  "UPDATE appointments SET stripeSessionId = ? WHERE id = ? AND status = 'Pending'",
);
const updatePendingBookingToBooked = db.prepare(
  "UPDATE appointments SET status = 'Booked' WHERE id = ? AND status = 'Pending'",
);
const claimConfirmationEmail = db.prepare(
  "UPDATE appointments SET confirmationEmailSentAt = datetime('now') WHERE id = ? AND status = 'Booked' AND confirmationEmailSentAt IS NULL",
);
const releaseConfirmationEmail = db.prepare(
  "UPDATE appointments SET confirmationEmailSentAt = NULL WHERE id = ?",
);
const selectBookingsByDate = db.prepare(
  "SELECT * FROM appointments WHERE substr(appointmentDateTime, 1, 10) = ? ORDER BY appointmentDateTime",
);
const changeBookingStatus = db.prepare(
  `UPDATE appointments
   SET status = ?
   WHERE id = ? AND patientEmail = ? COLLATE NOCASE AND status = 'Booked'`,
);
const selectUserByEmail = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE");
const insertUser = db.prepare(
  "INSERT INTO users (email, passwordHash) VALUES (?, ?) ON CONFLICT(email) DO NOTHING",
);
const selectBookingsForEmail = db.prepare(
  "SELECT * FROM appointments WHERE patientEmail = ? COLLATE NOCASE ORDER BY createdAt DESC, id DESC",
);

function createBooking(booking) {
  const result = insertBooking.run(
    booking.specialty,
    booking.doctor,
    booking.appointmentDateTime,
    booking.patientName,
    booking.patientPhone,
    booking.patientEmail,
  );

  return selectBookingById.get(Number(result.lastInsertRowid));
}

function getBookingsByEmail(email) {
  return selectBookingsForEmail.all(email);
}

function getBookingsByDate(date) {
  return selectBookingsByDate.all(date);
}

function updateStatus(id, status, patientEmail) {
  const result = changeBookingStatus.run(status, id, patientEmail);
  return result.changes === 0 ? null : selectBookingById.get(id);
}

function getBookingByStripeSessionId(stripeSessionId) {
  return selectBookingByStripeSessionId.get(stripeSessionId) || null;
}

function setStripeSessionId(id, stripeSessionId) {
  const result = setStripeSessionIdForBooking.run(stripeSessionId, id);
  return result.changes === 0 ? null : selectBookingById.get(id);
}

function markBookingAsPaid(id) {
  const result = updatePendingBookingToBooked.run(id);
  return result.changes === 0 ? null : selectBookingById.get(id);
}

// Atomically claims the single confirmation email; true only for the first caller.
function claimConfirmationEmailSend(id) {
  return claimConfirmationEmail.run(id).changes === 1;
}

function releaseConfirmationEmailClaim(id) {
  releaseConfirmationEmail.run(id);
}

function getUserByEmail(email) {
  return selectUserByEmail.get(email) || null;
}

function createUser(email, passwordHash) {
  const result = insertUser.run(email, passwordHash);
  return result.changes === 0 ? null : { id: Number(result.lastInsertRowid), email };
}

module.exports = {
  createBooking,
  getBookingsByEmail,
  getBookingsByDate,
  updateStatus,
  getBookingByStripeSessionId,
  setStripeSessionId,
  markBookingAsPaid,
  claimConfirmationEmailSend,
  releaseConfirmationEmailClaim,
  getUserByEmail,
  createUser,
};
