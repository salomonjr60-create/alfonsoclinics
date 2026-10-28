const express = require("express");
const bcrypt = require("bcryptjs");
const appointmentService = require("../services/appointmentService");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maximumPasswordBytes = 72;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readPassword(value) {
  return typeof value === "string" ? value : "";
}

function renderAccount(response, mode, email = "", error = null) {
  response.status(error ? 400 : 200).render("account", {
    clinicName: "Lakeside Medical Clinic",
    area: "JLT, Dubai",
    creditName: "Alfonso",
    isBooking: false,
    sectionBase: "/",
    pageTitle: `${mode === "register" ? "Register" : "Login"} | Lakeside Medical Clinic`,
    mode,
    email,
    error,
  });
}

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function requireLogin(request, response, next) {
  if (!request.session.user) {
    return response.redirect("/login");
  }

  next();
}

router.get("/register", (_request, response) => {
  renderAccount(response, "register");
});

router.post("/register", async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = readPassword(request.body.password);

  if (email.length > 254 || !emailPattern.test(email)) {
    return renderAccount(response, "register", email, "Enter a valid email address.");
  }

  if (
    Buffer.byteLength(password, "utf8") < 8 ||
    Buffer.byteLength(password, "utf8") > maximumPasswordBytes
  ) {
    return renderAccount(
      response,
      "register",
      email,
      "Password must be between 8 and 72 bytes.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = appointmentService.createUser(email, passwordHash);

  if (!user) {
    return renderAccount(response, "register", email, "An account with this email already exists.");
  }

  await regenerateSession(request);
  request.session.user = user;
  await saveSession(request);
  response.redirect("/my-appointments");
});

router.get("/login", (_request, response) => {
  renderAccount(response, "login");
});

router.post("/login", async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = readPassword(request.body.password);

  if (email.length > 254 || !emailPattern.test(email) || Buffer.byteLength(password, "utf8") > maximumPasswordBytes) {
    return renderAccount(response, "login", email, "Email or password is incorrect.");
  }

  const user = appointmentService.getUserByEmail(email);
  const passwordMatches =
    user && (await bcrypt.compare(password, user.passwordHash));

  if (!passwordMatches) {
    return renderAccount(response, "login", email, "Email or password is incorrect.");
  }

  await regenerateSession(request);
  request.session.user = { id: user.id, email: user.email };
  await saveSession(request);
  response.redirect("/my-appointments");
});

router.post("/logout", (request, response, next) => {
  request.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    response.clearCookie("connect.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.redirect("/");
  });
});

router.get("/my-appointments", requireLogin, (request, response) => {
  response.render("my-appointments", {
    clinicName: "Lakeside Medical Clinic",
    area: "JLT, Dubai",
    creditName: "Alfonso",
    isBooking: false,
    sectionBase: "/",
    pageTitle: "My Appointments | Lakeside Medical Clinic",
    bookings: appointmentService.getBookingsByEmail(request.session.user.email),
    cancelled: request.query.cancelled === "1",
    formattedAppointmentDate: (dateTime) =>
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Dubai",
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(dateTime)),
  });
});

router.post("/my-appointments/:id/cancel", requireLogin, (request, response) => {
  if (!/^[1-9]\d*$/.test(request.params.id)) {
    return response.sendStatus(404);
  }

  const bookingId = Number(request.params.id);
  if (!Number.isSafeInteger(bookingId)) {
    return response.sendStatus(404);
  }

  const booking = appointmentService.updateStatus(
    bookingId,
    "Cancelled",
    request.session.user.email,
  );

  if (!booking) {
    return response.sendStatus(404);
  }

  response.redirect("/my-appointments?cancelled=1");
});

module.exports = router;
