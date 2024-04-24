const express = require("express");
const router = express.Router();
const UserService = require("./UserService");

router.post("/api/1.0/users", async (req, res) => {
    await UserService.save(req.body);
  return res.status(200).send({ message: "User created" });
});

module.exports = router;
