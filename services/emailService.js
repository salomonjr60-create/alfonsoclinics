const nodemailer = require("nodemailer");

const CLINIC_NAME = "Lakeside Medical Clinic";
const CLINIC_ADDRESS = "Cluster X, JLT, Dubai";
const CREDIT_NAME = "Alfonso";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS must be set in .env");
  }

  const port = Number(SMTP_PORT);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function sendConfirmationEmail(appointment) {
  const transport = createTransport();
  const when = new Date(appointment.appointmentDateTime);
  const date = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dubai",
    dateStyle: "full",
  }).format(when);
  const time = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dubai",
    timeStyle: "short",
  }).format(when);
  const signOff = `${CLINIC_NAME} · built at London International · lisrc.ae · by ${CREDIT_NAME}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const text = [
    `Hello ${appointment.patientName},`,
    "",
    "Your appointment is confirmed.",
    "",
    `Specialty: ${appointment.specialty}`,
    `Doctor: ${appointment.doctor}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Clinic address: ${CLINIC_ADDRESS}`,
    "",
    signOff,
  ].join("\n");

  const html = `
    <p>Hello ${escapeHtml(appointment.patientName)},</p>
    <p>Your appointment is confirmed.</p>
    <ul>
      <li><strong>Specialty:</strong> ${escapeHtml(appointment.specialty)}</li>
      <li><strong>Doctor:</strong> ${escapeHtml(appointment.doctor)}</li>
      <li><strong>Date:</strong> ${escapeHtml(date)}</li>
      <li><strong>Time:</strong> ${escapeHtml(time)}</li>
      <li><strong>Clinic address:</strong> ${escapeHtml(CLINIC_ADDRESS)}</li>
    </ul>
    <p style="font-size:12px;color:#6b7c93">${escapeHtml(signOff)}</p>`;

  return transport.sendMail({
    from: { name: CLINIC_NAME, address: from },
    to: appointment.patientEmail,
    subject: "Your appointment is confirmed",
    text,
    html,
  });
}

module.exports = { sendConfirmationEmail };
