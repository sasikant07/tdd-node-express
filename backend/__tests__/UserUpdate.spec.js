const request = require("supertest");
const fs = require("fs");
const path = require("path");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const en = require("../locales/en/translation.json");
const tr = require("../locales/tr/translation.json");
const config = require("config");

const { uploadDir, profileDir } = config;
const profileDirectory = path.join(".", uploadDir, profileDir);

beforeAll(async () => {
  await sequelize.sync();
});

beforeEach(async () => {
  await User.destroy({ truncate: { cascade: true } });
});

afterAll(() => {
  const files = fs.readdirSync(profileDirectory);
  for (const file of files) {
    fs.unlinkSync(path.join(profileDirectory, file));
  }
});

const putUser = async (id = 5, body = null, options = {}) => {
  let agent = request(app);

  let token;
  if (options.auth) {
    const response = await agent.post("/api/1.0/auth").send(options.auth);
    token = response.body.token;
  }
  agent = request(app).put(`/api/1.0/users/` + id);

  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  if (token) {
    agent.set("Authorization", `Bearer ${token}`);
  }

  if (options.token) {
    agent.set("Authorization", `Bearer ${options.token}`);
  }
  return agent.send(body);
};

const activeUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P@ssw0rd",
};

const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;

  return await User.create(user);
};

const readFileasBase64 = () => {
  const filepath = path.join(".", "__tests__", "resources", "test-png.png");
  return fs.readFileSync(filepath, { encoding: "base64" });
};

describe("User Update", () => {
  it("returns forbidden when request sent without basic authorization", async () => {
    const response = await putUser();
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${"tr"}  | ${tr.unauthroized_user_update}
    ${"en"}  | ${en.unauthroized_user_update}
  `(
    "returns error body with $message for unauthorized request when language is $language",
    async ({ language, message }) => {
      const nowInMillis = new Date().getTime();
      const response = await putUser(5, null, { language });
      expect(response.body.path).toBe("/api/1.0/users/5");
      expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
      expect(response.body.message).toBe(message);
    },
  );

  it("returns forbidden when request sent with incorrect email in basic authorization", async () => {
    await addUser();
    const response = await putUser(5, null, {
      auth: { email: "user1000@mail.com", password: "P@ssw0rd" },
    });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when request sent with incorrect password in basic authorization", async () => {
    await addUser();
    const response = await putUser(5, null, {
      auth: { email: "user1@mail.com", password: "Passw0rd" },
    });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when update request is sent with correct credentials but for different user", async () => {
    await addUser();
    const userToBeupdated = await addUser({
      ...activeUser,
      username: "user2",
      email: "user2@mail.com",
    });
    const response = await putUser(userToBeupdated.id, null, {
      auth: { email: "user1@mail.com", password: "P@ssw0rd" },
    });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when update request is sent by inactive  user with correct credentials for its own user", async () => {
    const inactiveUser = await addUser({ ...activeUser, inactive: true });
    const userToBeupdated = await addUser({
      ...activeUser,
      username: "user2",
      email: "user2@mail.com",
    });
    const response = await putUser(inactiveUser.id, null, {
      auth: { email: "user1@mail.com", password: "P@ssw0rd" },
    });
    expect(response.status).toBe(403);
  });

  it("returns 200 ok when valid update request sent from authorized user", async () => {
    const savedUser = await addUser();
    const validUpdate = { username: "user1-updated" };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P@ssw0rd" },
    });
    expect(response.status).toBe(200);
  });

  it("updates username in database when valid update request is sent from authorized user", async () => {
    const savedUser = await addUser();
    const validUpdate = { username: "user1-updated" };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P@ssw0rd" },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.username).toBe(validUpdate.username);
  });

  it("returns 403 when token is not valid", async () => {
    const response = await putUser(5, null, { token: "123" });
    expect(response.status).toBe(403);
  });

  it("saves the user image when update conatins image as base64", async () => {
    const fileInBase64 = readFileasBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "user1-updated", image: fileInBase64 };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P@ssw0rd" },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.image).toBeTruthy();
  });

  it("returns success body having only id, username, email and image", async () => {
    const fileInBase64 = readFileasBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "user1-updated", image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P@ssw0rd" },
    });
    expect(Object.keys(response.body)).toEqual([
      "id",
      "username",
      "email",
      "image",
    ]);
  });

  it("saves the user image to upload folder and stores filename in user when update update image", async () => {
    const fileInBase64 = readFileasBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "user1-updated", image: fileInBase64 };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P@ssw0rd" },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    const profileImagePath = path.join(profileDirectory, inDBUser.image);
    expect(fs.existsSync(profileImagePath)).toBe(true);
  });
});
