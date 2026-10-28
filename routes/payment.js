const express = require("express");
const appointmentService = require("../services/appointmentService");
const emailService = require("../services/emailService");
const stripeService = require("../services/stripeService");

const router = express.Router();

function renderPaymentResult(response, state, appointment = null, message = "", status = 200) {
  return response.status(status).render("payment-result", {
    clinicName: "Lakeside Medical Clinic",
    area: "JLT, Dubai",
    creditName: "Alfonso",
    isBooking: false,
    sectionBase: "/",
    pageTitle:
      state === "paid"
        ? "Appointment confirmed | Lakeside Medical Clinic"
        : "Deposit payment | Lakeside Medical Clinic",
    state,
    appointment,
    message,
    formattedDateTime: appointment
      ? new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Dubai",
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date(appointment.appointmentDateTime))
      : "",
  });
}

router.get("/booking-success", async (request, response) => {
  const sessionId = request.query.session_id;
  if (
    typeof sessionId !== "string" ||
    !/^cs_test_[A-Za-z0-9_]{1,240}$/.test(sessionId)
  ) {
    return renderPaymentResult(
      response,
      "not-found",
      null,
      "We couldn't find an appointment for this payment session.",
      404,
    );
  }

  const appointment = appointmentService.getBookingByStripeSessionId(sessionId);
  if (!appointment) {
    return renderPaymentResult(
      response,
      "not-found",
      null,
      "We couldn't find an appointment for this payment session.",
      404,
    );
  }

  let checkoutSession;
  try {
    checkoutSession = await stripeService.retrieveCheckoutSession(sessionId);
  } catch (error) {
    console.error("Could not verify Stripe Checkout Session:", error.name);
    return renderPaymentResult(
      response,
      "unverified",
      appointment,
      "We couldn't verify your payment right now. Your appointment remains pending; please contact the clinic if you have already paid.",
      503,
    );
  }

  if (
    checkoutSession.id !== sessionId ||
    checkoutSession.client_reference_id !== String(appointment.id) ||
    checkoutSession.metadata?.appointmentId !== String(appointment.id) ||
    checkoutSession.mode !== "payment" ||
    checkoutSession.amount_total !== 10000 ||
    checkoutSession.currency !== "aed"
  ) {
    return renderPaymentResult(
      response,
      "not-found",
      null,
      "We couldn't match this payment session to an appointment.",
      404,
    );
  }

  if (checkoutSession.payment_status !== "paid") {
    return renderPaymentResult(
      response,
      "pending",
      appointment,
      "Payment was not completed. Your appointment is still pending and has not been confirmed.",
    );
  }

  if (appointment.status === "Cancelled") {
    return renderPaymentResult(
      response,
      "cancelled",
      appointment,
      "Payment was received, but this appointment has been cancelled. Please contact the clinic about your deposit.",
    );
  }

  const updatedAppointment = appointmentService.markBookingAsPaid(appointment.id);
  const confirmedAppointment =
    updatedAppointment || appointmentService.getBookingByStripeSessionId(sessionId);

  if (
    confirmedAppointment.status === "Booked" &&
    appointmentService.claimConfirmationEmailSend(confirmedAppointment.id)
  ) {
    try {
      await emailService.sendConfirmationEmail(confirmedAppointment);
    } catch (error) {
      // Release the claim so a later refresh can retry; the booking stays confirmed.
      appointmentService.releaseConfirmationEmailClaim(confirmedAppointment.id);
      console.error("Could not send confirmation email:", error.message);
    }
  }

  return renderPaymentResult(response, "paid", confirmedAppointment);
});

module.exports = router;
