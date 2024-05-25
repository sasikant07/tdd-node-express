const ForbidenException = require("../error/ForbidenException");
const UserService = require("../user/UserService");

const passwordResetTokenValidator = async (req, res, next) => {
  const user = await UserService.findByPasswordResetToken(
    req.body.passwordResetToken,
  );

  if (!user) {
    return next(new ForbidenException("unauthroized_password_reset"));
  }
  next();
};

module.exports = passwordResetTokenValidator;
