const app = require("./src/app");
const sequelize = require("./src/config/database");
const User = require("./src/user/User");
const bcrypt = require("bcrypt");
const TokenService = require("./src/auth/TokenService");

const addUsers = async (activeUserCount, inactiveUserCount = 0) => {
  const hash = await bcrypt.hash("P@ssw0rd", 10);
  for (let i = 0; i < activeUserCount + inactiveUserCount; i++) {
    await User.create({
      username: `user${i + 1}`,
      email: `user${i + 1}@mail.com`,
      inactive: i >= activeUserCount,
      password: hash,
    });
  }
};

sequelize.sync({ force: true }).then(async () => {
  await addUsers(25);
});

TokenService.scheduleCleanup();

app.listen(8080, () => console.log("Application running on port 8080"));
