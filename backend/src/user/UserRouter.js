const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const UserService = require("./UserService");
const ValidationException = require("../error/ValidationException");
const UserNotFoundException = require("./UserNotFoundException");
const pagination = require("../middleware/pagination");

router.post(
  "/api/1.0/users",
  check("username")
    .notEmpty()
    .withMessage("username_null")
    .bail()
    .isLength({ min: 4, max: 32 })
    .withMessage("username_size"),
  check("email")
    .notEmpty()
    .withMessage("email_null")
    .bail()
    .isEmail()
    .withMessage("email_invalid")
    .bail()
    .custom(async (email) => {
      const user = await UserService.findByEmail(email);
      if (user) {
        throw new Error("email_inuse");
      }
    }),
  check("password")
    .notEmpty()
    .withMessage("password_null")
    .bail()
    .isLength({ min: 6 })
    .withMessage("password_size")
    .bail()
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage("password_pattern"),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    try {
      await UserService.save(req.body);
      return res.status(200).send({ message: req.t("user_create_success") });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/api/1.0/users/token/:token", async (req, res, next) => {
  const token = req.params.token;
  try {
    await UserService.activate(token);
    return res
      .status(200)
      .send({ message: req.t("account_activation_success") });
  } catch (error) {
    next(error);
  }
});

router.get("/api/1.0/users", pagination, async (req, res) => {
  const { page, size } = req.pagination;
  const users = await UserService.getUsers(page, size);
  res.status(200).send(users);
});

router.get("/api/1.0/users/:id", async (req, res, next) => {
  try {
    const user = await UserService.getUser(req.params.id);
    res.status(200).send(user);
  } catch (error) {
    next(error);
  }
});
module.exports = router;
