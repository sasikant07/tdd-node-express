module.exports = {
  database: {
    database: "hoaxify",
    username: "my-db-user",
    password: "db-pass",
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: false,
  },
  mail: {
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: "chance.hessel80@ethereal.email",
      pass: "reY5kQ2gC6HCB4QGeQ",
    },
  },
  uploadDir: "uploads-dev",
  profileDir: "profile",
};
