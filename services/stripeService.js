const Stripe = require("stripe");

class StripeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith("sk_test_")) {
    throw new StripeConfigurationError(
      "Set STRIPE_SECRET_KEY to a Stripe test-mode secret key.",
    );
  }

  return new Stripe(secretKey);
}

function getBaseUrl() {
  const configuredBaseUrl = process.env.BASE_URL;
  if (!configuredBaseUrl) {
    throw new StripeConfigurationError("Set BASE_URL to this site's public base URL.");
  }

  let baseUrl;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new StripeConfigurationError("BASE_URL must be a valid HTTP or HTTPS URL.");
  }

  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) ||
    baseUrl.pathname !== "/" ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new StripeConfigurationError("BASE_URL must be an origin using HTTPS, or localhost HTTP.");
  }

  return baseUrl.origin;
}

async function createCheckoutSession(appointment) {
  const stripe = getStripeClient();
  const baseUrl = getBaseUrl();

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: appointment.patientEmail,
    client_reference_id: String(appointment.id),
    metadata: {
      appointmentId: String(appointment.id),
    },
    line_items: [
      {
        price_data: {
          currency: "aed",
          unit_amount: 10000,
          product_data: {
            name: "Refundable consultation deposit",
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/booking`,
  });
}

async function retrieveCheckoutSession(sessionId) {
  return getStripeClient().checkout.sessions.retrieve(sessionId);
}

module.exports = {
  StripeConfigurationError,
  createCheckoutSession,
  retrieveCheckoutSession,
};
