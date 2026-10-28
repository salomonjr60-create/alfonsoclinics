const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const express = require("express");
const bookingRouter = require("./routes/booking");
const accountRouter = require("./routes/account");
const paymentRouter = require("./routes/payment");
const session = require("express-session");

const app = express();
const port = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set in .env or the environment.");
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);
app.use((request, response, next) => {
  response.locals.currentUser = request.session.user || null;
  next();
});
app.use(accountRouter);
app.use(paymentRouter);
app.use("/booking", bookingRouter);

app.get("/", (_request, response) => {
  response.render("index", {
    clinicName: "Lakeside Medical Clinic",
    area: "JLT, Dubai",
    tagline: "Expert care, close to home",
    address: "Cluster X, JLT, Dubai",
    phone: "Phone number to be added",
    creditName: "Alfonso",
    isBooking: false,
    sectionBase: "",
    pageTitle: "Lakeside Medical Clinic | JLT, Dubai",
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).send("An unexpected error occurred.");
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Lakeside Medical Clinic is running at http://localhost:${port}`);
  });
}

module.exports = app;
