const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.resolve(
  process.env.DB_PATH ||
    (process.env.VERCEL ? "/tmp/lakeside.db" : path.join(__dirname, "lakeside.db")),
);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    specialty TEXT NOT NULL,
    doctor TEXT NOT NULL,
    appointmentDateTime TEXT NOT NULL,
    patientName TEXT NOT NULL,
    patientPhone TEXT NOT NULL,
    patientEmail TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Booked',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const appointmentColumns = db
  .prepare("PRAGMA table_info(appointments)")
  .all()
  .map(({ name }) => name);

if (!appointmentColumns.includes("stripeSessionId")) {
  db.exec("ALTER TABLE appointments ADD COLUMN stripeSessionId TEXT");
}

if (!appointmentColumns.includes("confirmationEmailSentAt")) {
  db.exec("ALTER TABLE appointments ADD COLUMN confirmationEmailSentAt TEXT");
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_stripe_session_id
  ON appointments (stripeSessionId)
  WHERE stripeSessionId IS NOT NULL
`);

module.exports = db;
