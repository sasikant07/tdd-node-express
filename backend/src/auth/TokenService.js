const jwt = require("jsonwebtoken");

const createToken = async (user) => {
  return jwt.sign({ id: user.id }, "this-is-our-secret");
};

const verify = (token) => {
  return jwt.verify(token, "this-is-our-secret")
}

module.exports = { createToken, verify };
