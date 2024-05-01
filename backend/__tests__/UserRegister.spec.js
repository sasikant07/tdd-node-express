const request = require("supertest");
const SMTPServer = require("smtp-server").SMTPServer;
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");

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

beforeEach(() => {
  simulateSmtpFailure = false;
  return User.destroy({ truncate: true });
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

  const username_null = "Username cannot be null";
  const username_size = "Must have min 4 and max 32 characters";
  const email_null = "Email cannot be null";
  const email_invalid = "Email is not valid";
  const password_null = "Password cannot be null";
  const password_size = "Password must be atleast 6 characters";
  const password_pattern =
    "Password must have atleast 1 uppercase, 1 lowercase letter and 1 number";
  const email_inuse = "Email in use";

  it.each`
    field         | value               | expectedMessage
    ${"username"} | ${null}             | ${username_null}
    ${"username"} | ${"usr"}            | ${username_size}
    ${"username"} | ${"a".repeat(33)}   | ${username_size}
    ${"email"}    | ${null}             | ${email_null}
    ${"email"}    | ${"mail.com"}       | ${email_invalid}
    ${"email"}    | ${"user.mail.com"}  | ${email_invalid}
    ${"email"}    | ${"user@mail"}      | ${email_invalid}
    ${"password"} | ${null}             | ${password_null}
    ${"password"} | ${"P@ssw"}          | ${password_size}
    ${"password"} | ${"alllowercase"}   | ${password_pattern}
    ${"password"} | ${"ALLUPPERCASE"}   | ${password_pattern}
    ${"password"} | ${"1234567890"}     | ${password_pattern}
    ${"password"} | ${"lowerandUPPER"}  | ${password_pattern}
    ${"password"} | ${"lowerand123456"} | ${password_pattern}
    ${"password"} | ${"UPPERAND123456"} | ${password_pattern}
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

  it(`returns ${email_inuse} when same email is already in use`, async () => {
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
    expect(response.body.message).toBe("Email failure");
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
    expect(response.body.message).toBe("Validation Failure");
  });
});

// Internationlization tests

describe("Internationalization", () => {
  const postUser = (user = validUser) => {
    return request(app)
      .post("/api/1.0/users")
      .set("Accept-Language", "tr")
      .send(user);
  };

  const username_null = "Kullanıcı adı boş olamaz";
  const username_size = "En az 4 en fazla 32 karakter olmalı";
  const email_null = "E-Posta boş olamaz";
  const email_invalid = "E-Posta geçerli değil";
  const password_null = "Şifre boş olamaz";
  const password_size = "Şifre en az 6 karakter olmalı";
  const password_pattern =
    "Şifrede en az 1 büyük, 1 küçük harf ve 1 sayı bulunmalıdır";
  const email_inuse = "Bu E-Posta kullanılıyor";
  const user_create_success = "Kullanıcı oluşturuldu";
  const email_failure = "E-Posta gönderiminde hata oluştu";
  const validation_failure = "Girilen değerler uygun değil";

  it.each`
    field         | value               | expectedMessage
    ${"username"} | ${null}             | ${username_null}
    ${"username"} | ${"usr"}            | ${username_size}
    ${"username"} | ${"a".repeat(33)}   | ${username_size}
    ${"email"}    | ${null}             | ${email_null}
    ${"email"}    | ${"mail.com"}       | ${email_invalid}
    ${"email"}    | ${"user.mail.com"}  | ${email_invalid}
    ${"email"}    | ${"user@mail"}      | ${email_invalid}
    ${"password"} | ${null}             | ${password_null}
    ${"password"} | ${"P@ssw"}          | ${password_size}
    ${"password"} | ${"alllowercase"}   | ${password_pattern}
    ${"password"} | ${"ALLUPPERCASE"}   | ${password_pattern}
    ${"password"} | ${"1234567890"}     | ${password_pattern}
    ${"password"} | ${"lowerandUPPER"}  | ${password_pattern}
    ${"password"} | ${"lowerand123456"} | ${password_pattern}
    ${"password"} | ${"UPPERAND123456"} | ${password_pattern}
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

  it(`returns ${email_inuse} when same email is already in use`, async () => {
    await User.create({ ...validUser });
    const response = await postUser({ ...validUser }, { language: "tr" });
    expect(response.body.validationErrors.email).toBe(email_inuse);
  });

  it(`returns success of message ${user_create_success} when signup request is valid when languase is set turkish`, async () => {
    const response = await postUser();
    expect(response.body.message).toBe(user_create_success);
  });

  it(`returns ${email_failure} message when sending mail fails and language is set as turkish`, async () => {
    simulateSmtpFailure = true;
    const response = await postUser({ ...validUser }, { language: "tr" });
    expect(response.body.message).toBe(email_failure);
  });

  it(`returns ${validation_failure} message in error response body when validation fails`, async () => {
    const response = await postUser(
      {
        username: null,
        email: validUser.email,
        password: "P@ssw0rd",
      },
      { language: "tr" },
    );
    expect(response.body.message).toBe(validation_failure);
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
    ${"tr"}  | ${"wrong"}   | ${"Bu hesap daha önce aktifleştirilmiş olabilir ya da token hatalı"}
    ${"en"}  | ${"wrong"}   | ${"This account is either active or the token is invalid"}
    ${"tr"}  | ${"correct"} | ${"Hesabınız aktifleştirildi"}
    ${"en"}  | ${"correct"} | ${"Account is activated"}
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
