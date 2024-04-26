const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");

beforeAll(() => {
  return sequelize.sync(); // perform an SQL query to the database and create a table
});

beforeEach(() => {
  return User.destroy({ truncate: true });
});

const validUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P@ssw0rd",
};

const postUser = (user = validUser) => {
  return request(app).post("/api/1.0/users").send(user);
};

describe("User Registration", () => {
  it("returns 200 OK when signup request is valid", async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  it("returns success message when signup request is valid", async () => {
    const response = await postUser();
    expect(response.body.message).toBe("User created");
  });

  it("saves the user to database", async () => {
    await postUser();
    const userList = await User.findAll();
    expect(userList.length).toBe(1);
  });

  it("saves the username and email to database", async () => {
    await postUser();
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.username).toBe("user1");
    expect(savedUser.email).toBe("user1@mail.com");
  });

  it("hashes the password in database", async () => {
    await postUser();
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.password).not.toBe("P@ssw0rd");
  });

  it("returns 400 when username is null", async () => {
    const response = await postUser({
      username: null,
      email: "user1@mail.com",
      password: "P@ssw0rd",
    });

    expect(response.status).toBe(400);
  });

  it("return validationsErrors failed in response bodywhen validation error occurs", async () => {
    const response = await postUser({
      username: null,
      email: "user1@mail.com",
      password: "P@ssw0rd",
    });

    const body = response.body;
    expect(body.validationErrors).not.toBeUndefined();
  });

  it("return errors for both when username and email is null", async () => {
    const response = await postUser({
      username: null,
      email: null,
      password: "P@ssw0rd",
    });

    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual(["username", "email"]);
  });

  it.each`
    field         | value               | expectedMessage
    ${"username"} | ${null}             | ${"Username cannot be null"}
    ${"username"} | ${"usr"}            | ${"Must have min 4 and max 32 characters"}
    ${"username"} | ${"a".repeat(33)}   | ${"Must have min 4 and max 32 characters"}
    ${"email"}    | ${null}             | ${"Email cannot be null"}
    ${"email"}    | ${"mail.com"}       | ${"Email is not valid"}
    ${"email"}    | ${"user.mail.com"}  | ${"Email is not valid"}
    ${"email"}    | ${"user@mail"}      | ${"Email is not valid"}
    ${"password"} | ${null}             | ${"Password cannot be null"}
    ${"password"} | ${"P@ssw"}          | ${"Password must be atleast 6 characters"}
    ${"password"} | ${"alllowercase"}   | ${"Password must have atleast 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"ALLUPPERCASE"}   | ${"Password must have atleast 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"1234567890"}     | ${"Password must have atleast 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"lowerandUPPER"}  | ${"Password must have atleast 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"lowerand123456"} | ${"Password must have atleast 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"UPPERAND123456"} | ${"Password must have atleast 1 uppercase, 1 lowercase letter and 1 number"}
  `(
    "returns $expectedMessage when $field is $value",
    async ({ field, expectedMessage, value }) => {
      const user = {
        username: "user1",
        email: "user1@mail.com",
        password: "P@ssw0rd",
      };
      user[field] = value;
      const response = await postUser(user);
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    },
  );

  it("returns Email in use when same email is already in use", async () => {
    await User.create({ ...validUser });
    const response = await postUser();
    expect(response.body.validationErrors.email).toBe("Email in use");
  });

  it("returns errors for both username is null and email in use", async () => {
    await User.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: "user1@mail.com",
      password: "P@ssw0rd",
    });

    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual(["username", "email"]);
  });
});
