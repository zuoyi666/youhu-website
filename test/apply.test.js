const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");

const applyHandler = require("../api/apply");
const {
  FIELD_LIMITS,
  QUESTION_LABELS,
  RESPONSE_KEYS,
  buildMessage,
  escapeHtml,
  validatePayload,
} = applyHandler.__test;

function validPayload(overrides = {}) {
  return {
    alias: "Night Tide",
    email: "founder@example.com",
    referralCode: "YH7K2Q",
    lang: "zh",
    website: "",
    responses: RESPONSE_KEYS.map((key, index) => ({
      key,
      labelZh: `问题 ${index + 1}`,
      labelEn: `Question ${index + 1}`,
      answer: `Answer ${index + 1}`,
    })),
    ...overrides,
  };
}

function mockResponse() {
  const headers = new Map();
  let body = "";

  return {
    headers,
    res: {
      statusCode: 200,
      setHeader(name, value) {
        headers.set(name.toLowerCase(), value);
      },
      end(value = "") {
        body = String(value);
      },
    },
    readBody() {
      return body ? JSON.parse(body) : null;
    },
  };
}

test("accepts the canonical complete application shape", () => {
  const result = validatePayload(validPayload());

  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.invalid, []);
  assert.equal(result.normalized.responses.length, RESPONSE_KEYS.length);
  assert.deepEqual(
    result.normalized.responses.map(({ key }) => key),
    RESPONSE_KEYS
  );
});

test("escapes applicant-controlled answers and metadata in the HTML email", () => {
  const payload = validPayload({
    alias: `<img src=x onerror="alert('alias')"> &`,
  });
  payload.responses[0] = {
    ...payload.responses[0],
    answer: "line one\n<b>line two</b>",
  };

  const { normalized, invalid, missing } = validatePayload(payload);
  assert.deepEqual(invalid, []);
  assert.deepEqual(missing, []);

  const message = buildMessage(normalized, "zh");
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
  assert.doesNotMatch(message.html, /<img|<b>/i);
  assert.match(message.html, /&lt;img src=x onerror=&quot;/);
  assert.match(message.html, /line one<br>&lt;b&gt;line two&lt;\/b&gt;/);
});

test("uses fixed server-side question labels instead of client labels", () => {
  const payload = validPayload();
  payload.responses[0].labelZh = "MALICIOUS_ZH_LABEL<script>";
  payload.responses[0].labelEn = "MALICIOUS_EN_LABEL<img>";

  const { normalized, invalid, missing } = validatePayload(payload);
  assert.deepEqual(invalid, []);
  assert.deepEqual(missing, []);
  assert.equal(normalized.responses[0].labelZh, undefined);
  assert.equal(normalized.responses[0].labelEn, undefined);

  for (const lang of ["zh", "en"]) {
    const message = buildMessage(normalized, lang);
    assert.doesNotMatch(message.text, /MALICIOUS_(?:ZH|EN)_LABEL/);
    assert.doesNotMatch(message.html, /MALICIOUS_(?:ZH|EN)_LABEL/);
    assert.ok(message.text.includes(QUESTION_LABELS.rituals[lang]));
  }
});

test("normalizes one valid mailbox and rejects ambiguous or malformed mailboxes", () => {
  const valid = validatePayload(
    validPayload({ email: " User.Name+tag@Sub.Example.COM " })
  );
  assert.deepEqual(valid.invalid, []);
  assert.equal(valid.normalized.email, "user.name+tag@sub.example.com");

  const invalidAddresses = [
    "user\0name@example.com",
    "user@example.com>",
    "first@example.com,second@example.com",
    "first@example.com;second@example.com",
    "Display Name <user@example.com>",
    ".user@example.com",
    "user.@example.com",
    "user..name@example.com",
    "user@example",
    "user@example..com",
    "user@-example.com",
    "user@example-.com",
    "user@exa_mple.com",
    `${"a".repeat(65)}@example.com`,
    `user@${"a".repeat(64)}.com`,
  ];

  for (const email of invalidAddresses) {
    assert.ok(
      validatePayload(validPayload({ email })).invalid.includes("email"),
      `expected invalid email: ${JSON.stringify(email)}`
    );
  }
});

test("rejects unexpected top-level and response-entry fields", () => {
  const payload = validPayload({ admin: true });
  payload.responses[0].html = "<strong>trusted</strong>";

  const result = validatePayload(payload);

  assert.ok(result.invalid.includes("payload.admin"));
  assert.ok(result.invalid.includes("responses.0.html"));
});

test("rejects oversized, non-string, duplicate, and unknown response data", () => {
  const oversizedAlias = validatePayload(
    validPayload({ alias: "a".repeat(FIELD_LIMITS.alias + 1) })
  );
  assert.ok(oversizedAlias.invalid.includes("alias"));

  const payload = validPayload();
  payload.responses[0].answer = 42;
  payload.responses[1].key = RESPONSE_KEYS[0];
  payload.responses[2].key = "not_a_real_question";
  payload.responses[3].answer = "a".repeat(FIELD_LIMITS.responseAnswer + 1);

  const result = validatePayload(payload);
  assert.ok(result.invalid.includes("responses.0.answer"));
  assert.ok(result.invalid.includes("responses.1.key"));
  assert.ok(result.invalid.includes("responses.2.key"));
  assert.ok(result.invalid.includes("responses.3.answer"));
});

test("accepts only the shared optional referral-code contract", () => {
  assert.deepEqual(validatePayload(validPayload({ referralCode: "" })).invalid, []);
  const canonical = validatePayload(
    validPayload({ referralCode: "abcd-1234" })
  );
  assert.deepEqual(canonical.invalid, []);
  assert.equal(canonical.normalized.referralCode, "ABCD-1234");

  for (const referralCode of [
    "ABC_1234",
    "ABC",
    "A".repeat(FIELD_LIMITS.referralCode + 1),
  ]) {
    assert.ok(
      validatePayload(validPayload({ referralCode })).invalid.includes(
        "referralCode"
      )
    );
  }
});

test("honeypot submissions are acknowledged without invoking SMTP", async () => {
  const req = Readable.from([JSON.stringify(validPayload({ website: "bot" }))]);
  req.method = "POST";
  const response = mockResponse();

  await applyHandler(req, response.res);

  assert.equal(response.res.statusCode, 200);
  assert.deepEqual(response.readBody(), { ok: true, status: "ignored" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rejects a configured multi-address recipient before SMTP", async () => {
  const environmentKeys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "APPLY_TO_EMAIL",
    "APPLY_FROM_EMAIL",
  ];
  const previousEnvironment = new Map(
    environmentKeys.map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, {
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USER: "sender@example.com",
    SMTP_PASS: "test-only-password",
    APPLY_TO_EMAIL: "first@example.com,second@example.com",
    APPLY_FROM_EMAIL: "sender@example.com",
  });

  try {
    const req = Readable.from([JSON.stringify(validPayload())]);
    req.method = "POST";
    const response = mockResponse();

    await applyHandler(req, response.res);

    assert.equal(response.res.statusCode, 503);
    assert.deepEqual(response.readBody(), {
      ok: false,
      error: "email_not_configured",
    });
  } finally {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
