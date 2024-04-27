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
});

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
});
