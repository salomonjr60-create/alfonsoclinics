const express = require("express");
const appointmentService = require("../services/appointmentService");
const stripeService = require("../services/stripeService");

const router = express.Router();

const doctorsBySpecialty = {
  "General Physician": "Dr. Sara Ahmed",
  ENT: "Dr. Omar Khan",
  Dentist: "Dr. Lina Haddad",
  Cardiologist: "Dr. Raj Mehta",
};

const specialties = Object.keys(doctorsBySpecialty);
const timeSlots = Array.from({ length: 24 }, (_, index) => {
  const minutes = 9 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const displayHour = hour % 12 || 12;

  return {
    value,
    label: `${displayHour}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
  };
});

function getDubaiDateTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function readField(body, name) {
  return body && typeof body[name] === "string" ? body[name].trim() : "";
}

function readBooking(body) {
  return {
    specialty: readField(body, "specialty"),
    doctor: readField(body, "doctor"),
    date: readField(body, "date"),
    time: readField(body, "time"),
    patientName: readField(body, "patientName"),
    patientPhone: readField(body, "patientPhone"),
    patientEmail: readField(body, "patientEmail"),
  };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateSelection(booking) {
  const errors = {};

  if (!specialties.includes(booking.specialty)) {
    errors.specialty = "Choose a specialty from the list.";
  }

  if (
    !doctorsBySpecialty[booking.specialty] ||
    booking.doctor !== doctorsBySpecialty[booking.specialty]
  ) {
    errors.doctor = "Choose the listed doctor for your selected specialty.";
  }

  return errors;
}

function validateAppointment(booking) {
  const errors = {};
  const dubaiNow = getDubaiDateTime();

  if (!isValidDate(booking.date)) {
    errors.date = "Choose a valid appointment date.";
  } else if (booking.date < dubaiNow.date) {
    errors.date = "Choose today or a future date.";
  } else if (new Date(`${booking.date}T12:00:00.000Z`).getUTCDay() === 0) {
    errors.date = "The clinic is closed on Sundays. Choose another date.";
  }

  if (!timeSlots.some(({ value }) => value === booking.time)) {
    errors.time = "Choose a time between 9:00 AM and 8:30 PM.";
  } else if (
    booking.date === dubaiNow.date &&
    Number(booking.time.slice(0, 2)) * 60 + Number(booking.time.slice(3)) <= dubaiNow.minutes
  ) {
    errors.time = "Choose a time that has not passed.";
  }

  return errors;
}

function validatePatient(booking) {
  const errors = {};
  const phoneDigits = booking.patientPhone.replace(/\D/g, "");

  if (
    booking.patientName.length < 2 ||
    booking.patientName.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(booking.patientName)
  ) {
    errors.patientName = "Enter a name between 2 and 100 characters.";
  }

  if (
    !/^\+?[0-9][0-9\s().-]{5,19}$/.test(booking.patientPhone) ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    errors.patientPhone = "Enter a valid phone number with 7 to 15 digits.";
  }

  if (
    booking.patientEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.patientEmail)
  ) {
    errors.patientEmail = "Enter a valid email address.";
  }

  return errors;
}

function formatDate(value) {
  if (!isValidDate(value)) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function renderBooking(response, booking, step, errors = {}, confirmed = false, savedBooking = null) {
  const dubaiNow = getDubaiDateTime();
  const minimumDate = dubaiNow.date;

  response.render("booking", {
    clinicName: "Lakeside Medical Clinic",
    area: "JLT, Dubai",
    creditName: "Alfonso",
    isBooking: true,
    sectionBase: "/",
    pageTitle: "Book an appointment | Lakeside Medical Clinic",
    booking,
    step,
    errors,
    specialties,
    doctor: doctorsBySpecialty[booking.specialty] || "",
    timeSlots: timeSlots.map((slot) => ({
      ...slot,
      disabled:
        booking.date === minimumDate &&
        Number(slot.value.slice(0, 2)) * 60 + Number(slot.value.slice(3)) <= dubaiNow.minutes,
    })),
    minimumDate,
    formattedDate: formatDate(booking.date),
    formattedTime: timeSlots.find(({ value }) => value === booking.time)?.label || "",
    confirmed,
    savedBooking,
  });
}

router.get("/", (request, response) => {
  const booking = readBooking({});
  if (request.session.user) {
    booking.patientEmail = request.session.user.email;
  }

  renderBooking(response, booking, 1);
});

router.post("/", async (request, response) => {
  const booking = readBooking(request.body);
  if (request.session.user) {
    booking.patientEmail = request.session.user.email;
  }
  const submittedStep = Number(readField(request.body, "step"));
  const action = readField(request.body, "action");

  if (action === "back" && Number.isInteger(submittedStep) && submittedStep > 1 && submittedStep <= 5) {
    return renderBooking(response, booking, submittedStep === 5 ? 4 : submittedStep - 1);
  }

  if (submittedStep === 1) {
    const errors = validateSelection({ ...booking, doctor: doctorsBySpecialty[booking.specialty] });
    return renderBooking(response, booking, Object.keys(errors).length ? 1 : 2, errors);
  }

  if (submittedStep === 2) {
    const errors = validateSelection(booking);
    if (Object.keys(errors).length) {
      return renderBooking(response, booking, 2, errors);
    }

    return renderBooking(response, booking, 3);
  }

  if (submittedStep === 3 || submittedStep === 4 || submittedStep === 5) {
    const selectionErrors = validateSelection(booking);
    if (Object.keys(selectionErrors).length) {
      return renderBooking(response, booking, 2, selectionErrors);
    }

    const appointmentErrors = validateAppointment(booking);
    if (Object.keys(appointmentErrors).length) {
      return renderBooking(response, booking, 3, appointmentErrors);
    }

    if (submittedStep === 3) {
      return renderBooking(response, booking, 4);
    }

    const patientErrors = validatePatient(booking);
    if (Object.keys(patientErrors).length) {
      return renderBooking(response, booking, 4, patientErrors);
    }

    if (submittedStep === 4) {
      return renderBooking(response, booking, 5);
    }

    if (action !== "confirm") {
      return renderBooking(response, booking, 5, { form: "Use Confirm booking to finish reviewing your details." });
    }

    const savedBooking = appointmentService.createBooking({
      specialty: booking.specialty,
      doctor: booking.doctor,
      appointmentDateTime: `${booking.date}T${booking.time}:00+04:00`,
      patientName: booking.patientName,
      patientPhone: booking.patientPhone,
      patientEmail: booking.patientEmail,
    });

    try {
      const checkoutSession = await stripeService.createCheckoutSession(savedBooking);
      if (
        !checkoutSession.id ||
        !checkoutSession.url ||
        new URL(checkoutSession.url).origin !== "https://checkout.stripe.com"
      ) {
        throw new Error("Stripe returned an invalid Checkout Session.");
      }

      const updatedBooking = appointmentService.setStripeSessionId(
        savedBooking.id,
        checkoutSession.id,
      );
      if (!updatedBooking) {
        throw new Error("Could not link the Stripe Checkout Session to the pending appointment.");
      }

      return response.redirect(303, checkoutSession.url);
    } catch (error) {
      console.error("Could not create or save Stripe Checkout Session:", error.name);
      return response.status(error instanceof stripeService.StripeConfigurationError ? 503 : 502)
        .render("payment-result", {
          clinicName: "Lakeside Medical Clinic",
          area: "JLT, Dubai",
          creditName: "Alfonso",
          isBooking: false,
          sectionBase: "/",
          pageTitle: "Deposit payment unavailable | Lakeside Medical Clinic",
          state: "unavailable",
          appointment: savedBooking,
          formattedDateTime: new Intl.DateTimeFormat("en", {
            timeZone: "Asia/Dubai",
            dateStyle: "long",
            timeStyle: "short",
          }).format(new Date(savedBooking.appointmentDateTime)),
          message: "We couldn't start your deposit payment. Your appointment is pending and has not been confirmed. Please try again later or contact the clinic.",
        });
    }
  }

  return renderBooking(response, booking, 1, { form: "Restart the booking form and try again." });
});

module.exports = router;
