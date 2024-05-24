const User = require("./User");
const bcrypt = require("bcrypt");
const Sequelize = require("sequelize");
const EmailService = require("../email/EmailService");
const sequelize = require("../config/database");
const EmailException = require("../email/EmailException");
const InvalidTokenException = require("./InvalidTokenException");
const { randomString } = require("../shared/generator");
const NotFoundException = require("../error/NotFoundException");

const save = async (body) => {
  const { username, email, password } = body;
  const hash = await bcrypt.hash(password, 10);
  const user = {
    username,
    email,
    password,
    password: hash,
    activationToken: randomString(16),
  };
  const transaction = await sequelize.transaction();
  await User.create(user, { transaction });
  try {
    await EmailService.sendAccountActivation(email, user.activationToken);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw new EmailException();
  }
};

const findByEmail = async (email) => {
  return User.findOne({ where: { email: email } });
};

const activate = async (token) => {
  const user = await User.findOne({ where: { activationToken: token } });
  if (!user) {
    throw new InvalidTokenException();
  }
  user.inactive = false;
  user.activationToken = null;
  await user.save();
};

const getUsers = async (page, size, authenticatedUser) => {
  const userWithCouunt = await User.findAndCountAll({
    where: {
      inactive: false,
      id: { [Sequelize.Op.not]: authenticatedUser ? authenticatedUser.id : 0 },
    },
    attributes: ["id", "username", "email"],
    limit: size,
    offset: page * size,
  });
  return {
    content: userWithCouunt.rows,
    page,
    size,
    totalPages: Math.ceil(userWithCouunt.count / size),
  };
};

const getUser = async (id) => {
  const user = await User.findOne({
    where: { id: id, inactive: false },
    attributes: ["id", "username", "email"],
  });
  if (!user) {
    throw new NotFoundException("user_not_found");
  }

  return user;
};

const updateUser = async (id, updateBody) => {
  const user = await User.findOne({ where: { id: id } });
  user.username = updateBody.username;
  await user.save();
};

const deleteUser = async (id) => {
  await User.destroy({ where: { id: id } });
};

const passwordResetRequest = async (email) => {
  const user = await findByEmail(email);

  if (!user) {
    throw new NotFoundException("email_not_inuse");
  }

  user.passwordResetTokem = randomString(16);
  await user.save();
};

module.exports = {
  save,
  findByEmail,
  activate,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  passwordResetRequest,
};
