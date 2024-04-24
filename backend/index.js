const app = require("./src/app");
const sequelize = require("./src/config/database");

sequelize.sync();

app.listen(8080, () => console.log("Application running on port 8080"));