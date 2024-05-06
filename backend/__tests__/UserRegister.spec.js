const request = require("supertest");
const SMTPServer = require("smtp-server").SMTPServer;
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const en = require("../locales/en/translation.json");
const tr = require("../locales/tr/translation.json");

let lastMail, server;
let simulateSmtpFailure = false;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
      let mailBody;
      stream.on("data", (data) => {
        mailBody += data.toString();
      });
      stream.on("end", () => {
        if (simulateSmtpFailure) {
          const err = new Error("inavlid mailbox");
          err.responseCode = 553;
          return callback(err);
        }
        lastMail = mailBody;
        callback();
      });
    },
  });

  await server.listen(8587, "localhost");
  await sequelize.sync(); // perform an SQL query to the database and create a table
});

beforeEach(async () => {
  simulateSmtpFailure = false;
  await User.destroy({ truncate: true });
});

afterAll(async () => {
  await server.close();
});

const validUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P@ssw0rd",
};

const postUser = (user = validUser, options = {}) => {
  const agent = request(app).post("/api/1.0/users");
  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  return agent.send(user);
};

describe("User Registration", () => {
  it("returns 200 OK when signup request is valid", async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  it("returns success message when signup request is valid", async () => {
    const response = await postUser();
    expect(response.body.message).toBe(en.user_create_success);
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
    ${"username"} | ${null}             | ${en.username_null}
    ${"username"} | ${"usr"}            | ${en.username_size}
    ${"username"} | ${"a".repeat(33)}   | ${en.username_size}
    ${"email"}    | ${null}             | ${en.email_null}
    ${"email"}    | ${"mail.com"}       | ${en.email_invalid}
    ${"email"}    | ${"user.mail.com"}  | ${en.email_invalid}
    ${"email"}    | ${"user@mail"}      | ${en.email_invalid}
    ${"password"} | ${null}             | ${en.password_null}
    ${"password"} | ${"P@ssw"}          | ${en.password_size}
    ${"password"} | ${"alllowercase"}   | ${en.password_pattern}
    ${"password"} | ${"ALLUPPERCASE"}   | ${en.password_pattern}
    ${"password"} | ${"1234567890"}     | ${en.password_pattern}
    ${"password"} | ${"lowerandUPPER"}  | ${en.password_pattern}
    ${"password"} | ${"lowerand123456"} | ${en.password_pattern}
    ${"password"} | ${"UPPERAND123456"} | ${en.password_pattern}
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

  it(`returns ${en.email_inuse} when same email is already in use`, async () => {
    await User.create({ ...validUser });
    const response = await postUser();
    expect(response.body.validationErrors.email).toBe(email_inuse);
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

  it("creates user in inactive mode", async () => {
    await postUser();
    const users = await User.findAll();
    const savedUsers = users[0];
    expect(savedUsers.inactive).toBe(true);
  });

  it("creates user in inactive mode even the request body contains inactive as false", async () => {
    const newUser = { ...validUser, inactive: false };
    await postUser(newUser);
    const users = await User.findAll();
    const savedUsers = users[0];
    expect(savedUsers.inactive).toBe(true);
  });

  it("creates an activationTOken for user", async () => {
    await postUser();
    const users = await User.findAll();
    const savedUsers = users[0];
    expect(savedUsers.activationToken).toBeTruthy();
  });

  it("sends an Account activation email with activationToken", async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(lastMail).toContain("user1@mail.com");
    expect(lastMail).toContain(savedUser.activationToken);
  });

  it("returns 502 Bad Gateway when sending email fails", async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.status).toBe(502);
  });

  it("returns email failure message when sending mail fails", async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.body.message).toBe(en.email_failure);
  });

  it("does not save user to database if activation email fails", async () => {
    simulateSmtpFailure = true;
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(0);
  });

  it("returns validation failure message in error response body when validation fails", async () => {
    const response = await postUser({
      username: null,
      email: validUser.email,
      password: "P@ssw0rd",
    });
    expect(response.body.message).toBe(en.validation_failure);
  });
});

// Internationlization tests

describe("Internationalization", () => {
  it.each`
    field         | value               | expectedMessage
    ${"username"} | ${null}             | ${tr.username_null}
    ${"username"} | ${"usr"}            | ${tr.username_size}
    ${"username"} | ${"a".repeat(33)}   | ${tr.username_size}
    ${"email"}    | ${null}             | ${tr.email_null}
    ${"email"}    | ${"mail.com"}       | ${tr.email_invalid}
    ${"email"}    | ${"user.mail.com"}  | ${tr.email_invalid}
    ${"email"}    | ${"user@mail"}      | ${tr.email_invalid}
    ${"password"} | ${null}             | ${tr.password_null}
    ${"password"} | ${"P@ssw"}          | ${tr.password_size}
    ${"password"} | ${"alllowercase"}   | ${tr.password_pattern}
    ${"password"} | ${"ALLUPPERCASE"}   | ${tr.password_pattern}
    ${"password"} | ${"1234567890"}     | ${tr.password_pattern}
    ${"password"} | ${"lowerandUPPER"}  | ${tr.password_pattern}
    ${"password"} | ${"lowerand123456"} | ${tr.password_pattern}
    ${"password"} | ${"UPPERAND123456"} | ${tr.password_pattern}
  `(
    "returns $expectedMessage when $field is $value when language is set as turkish",
    async ({ field, expectedMessage, value }) => {
      const user = {
        username: "user1",
        email: "user1@mail.com",
        password: "P@ssw0rd",
      };
      user[field] = value;
      const response = await postUser(user, { language: "tr" });
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    },
  );

  it(`returns ${tr.email_inuse} when same email is already in use`, async () => {
    await User.create({ ...validUser });
    const response = await postUser({ ...validUser }, { language: "tr" });
    expect(response.body.validationErrors.email).toBe(tr.email_inuse);
  });

  it(`returns success of message ${tr.user_create_success} when signup request is valid when languase is set turkish`, async () => {
    const response = await postUser();
    expect(response.body.message).toBe(tr.user_create_success);
  });

  it(`returns ${tr.email_failure} message when sending mail fails and language is set as turkish`, async () => {
    simulateSmtpFailure = true;
    const response = await postUser({ ...validUser }, { language: "tr" });
    expect(response.body.message).toBe(tr.email_failure);
  });

  it(`returns ${tr.validation_failure} message in error response body when validation fails`, async () => {
    const response = await postUser(
      {
        username: null,
        email: validUser.email,
        password: "P@ssw0rd",
      },
      { language: "tr" },
    );
    expect(response.body.message).toBe(tr.validation_failure);
  });
});

// Account Activation
describe("Account activation", () => {
  it("activates the account when correct token is sent", async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    users = await User.findAll();
    expect(users[0].inactive).toBe(false);
  });

  it("removes the token from user table after successfull activation", async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    users = await User.findAll();
    expect(users[0].activationToken).toBeFalsy();
  });

  it("does not activate the account when token is wrong", async () => {
    await postUser();
    let users = await User.findAll();
    const token = "this-token-does-not-exist";

    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    users = await User.findAll();
    expect(users[0].inactive).toBe(true);
  });

  it("returns Bad request when token is wrong", async () => {
    await postUser();
    const token = "this-token-does-not-exist";

    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    expect(response.status).toBe(400);
  });

  it.each`
    language | tokenStatus  | message
    ${"tr"}  | ${"wrong"}   | ${tr.account_activation_failure}
    ${"en"}  | ${"wrong"}   | ${en.account_activation_failure}
    ${"tr"}  | ${"correct"} | ${tr.account_activation_success}
    ${"en"}  | ${"correct"} | ${en.account_activation_success}
  `(
    "returns $message when wrong token is $tokenStatus sent and language is $language",
    async ({ language, message, tokenStatus }) => {
      await postUser();
      let token = "this-token-does-not-exist";

      if (tokenStatus === "correct") {
        let users = await User.findAll();
        token = users[0].activationToken;
      }
      const response = await request(app)
        .post("/api/1.0/users/token/" + token)
        .set("Accept-Language", language)
        .send();
      expect(response.body.message).toBe(message);
    },
  );
});

// Error Handler
describe("Error Model", () => {
  it("return path, timestamp, message and validationErrors in response when validation failure", async () => {
    const response = await postUser({ ...validUser, username: null });
    const body = response.body;

    expect(Object.keys(body)).toEqual([
      "path",
      "timestamp",
      "message",
      "validationErrors",
    ]);
  });

  it("returns path, timestamp, message in response when request fails other than validation error", async () => {
    const token = "this-token-does-not-exist";

    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();

    const body = response.body;
    expect(Object.keys(body)).toEqual(["path", "timestamp", "message"]);
  });

  it("returns path in error body", async () => {
    const token = "this-token-does-not-exist";

    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();

    const body = response.body;
    expect(body.path).toEqual("/api/1.0/users/token/" + token);
  });

  it("returns timestamp in milliseconds within 5 seconds value in error body", async () => {
    const nowInMillis = new Date().getTime();
    const fiveSecondsLater = nowInMillis + 5 * 1000;
    const token = "this-token-does-not-exist";

    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();

    const body = response.body;
    expect(body.timestamp).toBeGreaterThan(nowInMillis);
    expect(body.timestamp).toBeLessThan(fiveSecondsLater);
  });
});
