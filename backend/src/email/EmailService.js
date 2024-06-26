const nodemailer = require("nodemailer");
const transporter = require("../config/emailTransporter");

const sendAccountActivation = async (email, token) => {
  const info = await transporter.sendMail({
    from: "My App <info@my-app.com>",
    to: email,
    subject: "Account ACtivation",
    html: `
    <div>
        <b>Please click below link to activate your account</b>
    </div>
    <div>
    <a href="http://localhost:3000/#/login?token=${token}">Activate</a>
    Token is ${token}
    </div>`,
  });
  if (process.env.NODE_ENV === "development") {
    console.log("url: " + nodemailer.getTestMessageUrl(info));
  }
};

const sendPasswordReset = async (email, token) => {
  const info = await transporter.sendMail({
    from: "My App <info@my-app.com>",
    to: email,
    subject: "Password Reset",
    html: `
    <div>
        <b>Please click below link to reset your password</b>
    </div>
    <div>
    <a href="http://localhost:3000/#/password-reset?reset=${token}">Reset</a>
    Token is ${token}
    </div>`,
  });
  if (process.env.NODE_ENV === "development") {
    console.log("url: " + nodemailer.getTestMessageUrl(info));
  }
};

module.exports = { sendAccountActivation, sendPasswordReset };
