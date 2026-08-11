const nodemailer = require("nodemailer");

const MAX_BODY_BYTES = 128 * 1024;
const MAX_TOTAL_ANSWER_CHARS = 40_000;
const FIELD_LIMITS = Object.freeze({
  alias: 80,
  email: 254,
  referralCode: 32,
  website: 200,
  responseKey: 64,
  responseLabel: 500,
  responseAnswer: 4000,
});

const RESPONSE_KEYS = Object.freeze([
  "rituals",
  "logging_frequency",
  "primary_tool",
  "practice_timeline",
  "hold_moment",
  "distress_response",
  "self_description",
  "revisit_frequency",
  "reflection_goal",
  "hardest_part",
  "messy_writing",
  "long_view",
  "entry_point",
  "product_role",
  "feedback_commitment",
  "feedback_style",
  "unclear_moment",
  "recurring_pattern",
  "six_month_change",
  "founder_contribution",
]);

const QUESTION_LABELS = Object.freeze({
  rituals: Object.freeze({
    zh: "过去 30 天，你实际用过哪些方式整理自己？",
    en: "In the last 30 days, which practices did you actually use to process yourself?",
  }),
  logging_frequency: Object.freeze({
    zh: "最近一个月，你平均每周会主动记录几次？",
    en: "Over the last month, how many times per week did you intentionally record something about yourself?",
  }),
  primary_tool: Object.freeze({
    zh: "你现在最常依赖哪一种方式？",
    en: "Which option do you currently rely on the most?",
  }),
  practice_timeline: Object.freeze({
    zh: "你和“记录自己”这件事，大概持续多久了？",
    en: "How long have you had any ongoing practice of recording yourself?",
  }),
  hold_moment: Object.freeze({
    zh: "你最希望一个产品真正接住你的时刻，通常是什么时刻？",
    en: "When do you most want a product to genuinely hold you?",
  }),
  distress_response: Object.freeze({
    zh: "当你状态不好时，你的第一反应通常是什么？",
    en: "When you are not doing well, what is your usual first response?",
  }),
  self_description: Object.freeze({
    zh: "下面哪种描述最像你？",
    en: "Which description feels closest to you?",
  }),
  revisit_frequency: Object.freeze({
    zh: "你会回看自己以前的记录吗？",
    en: "Do you ever revisit your previous records?",
  }),
  reflection_goal: Object.freeze({
    zh: "你记录时，最想得到的是什么？",
    en: "When you record yourself, what do you most hope to get from it?",
  }),
  hardest_part: Object.freeze({
    zh: "对你来说，最难长期坚持的是哪一件事？",
    en: "Which part is hardest for you to maintain over time?",
  }),
  messy_writing: Object.freeze({
    zh: "你愿意把还没整理好的情绪原样写下来吗？",
    en: "Are you willing to write down emotions before they are cleaned up or organized?",
  }),
  long_view: Object.freeze({
    zh: "如果你能长期看见一种变化，你最想看见哪一类？",
    en: "If you could track one kind of change over time, which would matter most to you?",
  }),
  entry_point: Object.freeze({
    zh: "你第一次被 Youhu 的哪一部分吸引？",
    en: "Which part of Youhu pulled you in first?",
  }),
  product_role: Object.freeze({
    zh: "如果 Youhu 对你真的有价值，它更像什么？",
    en: "If Youhu becomes genuinely valuable to you, what would it feel like?",
  }),
  feedback_commitment: Object.freeze({
    zh: "如果进入创世计划，你愿意连续 3 周给出真实反馈吗？",
    en: "If accepted, are you willing to give honest feedback for three continuous weeks?",
  }),
  feedback_style: Object.freeze({
    zh: "你更适合哪种反馈方式？",
    en: "Which feedback style fits you best?",
  }),
  unclear_moment: Object.freeze({
    zh: "你最容易在哪种时刻强烈感觉“没有人真正懂我”？",
    en: "In which kind of moment are you most likely to strongly feel that no one truly understands you?",
  }),
  recurring_pattern: Object.freeze({
    zh: "如果说你身上有一种常重复出现的模式，它更像哪一类？",
    en: "If there is one pattern that keeps repeating in you, which category feels closest?",
  }),
  six_month_change: Object.freeze({
    zh: "如果未来 6 个月 Youhu 能真正帮助你，你最希望它帮助你发生哪一种改变？",
    en: "If Youhu could genuinely help you over the next six months, what change would you most hope it helps you create?",
  }),
  founder_contribution: Object.freeze({
    zh: "你会成为怎样的一位 Founder？你会带来什么样的使用深度或反馈价值？",
    en: "What kind of founder would you be, and what kind of usage depth or feedback value would you bring?",
  }),
});

const RESPONSE_KEY_SET = new Set(RESPONSE_KEYS);
const TOP_LEVEL_KEYS = new Set([
  "responses",
  "alias",
  "email",
  "referralCode",
  "lang",
  "website",
]);
const RESPONSE_ENTRY_KEYS = new Set(["key", "labelZh", "labelEn", "answer"]);

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;

    req.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        const error = new Error("payload_too_large");
        error.code = "payload_too_large";
        reject(error);
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readString(value, maxLength, { allowLineBreaks = false } = {}) {
  if (value === undefined || value === null) {
    return { value: "", valid: true };
  }
  if (typeof value !== "string") {
    return { value: "", valid: false };
  }

  const normalized = value.trim();
  const forbiddenControls = allowLineBreaks
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
    : /[\u0000-\u001F\u007F]/;

  return {
    value: normalized,
    valid: normalized.length <= maxLength && !forbiddenControls.test(normalized),
  };
}

function normalizeEmailAddress(value) {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > FIELD_LIMITS.email ||
    [...normalized].some(
      (character) => character.codePointAt(0) < 33 || character.codePointAt(0) === 127
    ) ||
    normalized.split("@").length !== 2
  ) {
    return null;
  }

  const [localPart, domain] = normalized.split("@");
  if (
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)
  ) {
    return null;
  }

  const domainLabels = domain.split(".");
  if (
    domainLabels.length < 2 ||
    domainLabels.some(
      (label) => !/^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i.test(label)
    )
  ) {
    return null;
  }

  return `${localPart}@${domain}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function htmlText(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

function buildSection(titleZh, titleEn, value) {
  return {
    zh: `${titleZh}：${value || "未填写"}`,
    en: `${titleEn}: ${value || "Not provided"}`,
  };
}

function buildMessage(payload, lang) {
  const questionSections = payload.responses.map((entry) => {
    const labels = QUESTION_LABELS[entry.key];
    return buildSection(labels.zh, labels.en, entry.answer);
  });

  const metaSections = [
    buildSection("昵称 / 代号", "Alias", payload.alias),
    buildSection("邮箱", "Email", payload.email),
    buildSection(
      "推荐邀请码",
      "Referral code",
      payload.referralCode || (lang === "zh" ? "无" : "None")
    ),
    buildSection(
      "浏览语言",
      "Browsing language",
      payload.lang === "zh" ? "中文" : "English"
    ),
    buildSection("提交来源", "Source", "youhu.space /apply"),
  ];

  const sections = [...questionSections, ...metaSections];

  return {
    text: sections
      .map((entry) => (lang === "zh" ? entry.zh : entry.en))
      .join("\n\n"),
    html: sections
      .map((entry) => `<p>${htmlText(lang === "zh" ? entry.zh : entry.en)}</p>`)
      .join(""),
  };
}

function validatePayload(payload) {
  const missing = [];
  const invalid = [];
  const normalized = {
    alias: "",
    email: "",
    responses: [],
    referralCode: "",
    lang: "zh",
    website: "",
  };

  if (!isPlainObject(payload)) {
    return { missing, invalid: ["payload"], normalized };
  }

  for (const key of Object.keys(payload)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      invalid.push(`payload.${key}`);
    }
  }

  const website = readString(payload.website, FIELD_LIMITS.website);
  normalized.website = website.value;
  if (!website.valid) {
    invalid.push("website");
  }

  const alias = readString(payload.alias, FIELD_LIMITS.alias);
  normalized.alias = alias.value;
  if (!alias.value) {
    missing.push("alias");
  } else if (!alias.valid) {
    invalid.push("alias");
  }

  const email = readString(payload.email, FIELD_LIMITS.email);
  const normalizedEmail = email.valid ? normalizeEmailAddress(email.value) : null;
  if (!email.value) {
    missing.push("email");
  } else if (!normalizedEmail) {
    invalid.push("email");
  } else {
    normalized.email = normalizedEmail;
  }

  const referralCode = readString(payload.referralCode, FIELD_LIMITS.referralCode);
  normalized.referralCode = referralCode.value.toUpperCase();
  if (
    !referralCode.valid ||
    (normalized.referralCode &&
      !/^[A-Z0-9-]{4,32}$/.test(normalized.referralCode))
  ) {
    invalid.push("referralCode");
  }

  if (typeof payload.lang !== "string" || !["zh", "en"].includes(payload.lang)) {
    if (payload.lang === undefined || payload.lang === null || payload.lang === "") {
      missing.push("lang");
    } else {
      invalid.push("lang");
    }
  } else {
    normalized.lang = payload.lang;
  }

  const responseMap = new Map();
  let totalAnswerChars = 0;

  if (!Array.isArray(payload.responses)) {
    invalid.push("responses");
  } else {
    if (payload.responses.length > RESPONSE_KEYS.length) {
      invalid.push("responses.length");
    }

    payload.responses.forEach((entry, index) => {
      const prefix = `responses.${index}`;
      if (!isPlainObject(entry)) {
        invalid.push(prefix);
        return;
      }

      for (const key of Object.keys(entry)) {
        if (!RESPONSE_ENTRY_KEYS.has(key)) {
          invalid.push(`${prefix}.${key}`);
        }
      }

      const key = readString(entry.key, FIELD_LIMITS.responseKey);
      const labelZh = readString(entry.labelZh, FIELD_LIMITS.responseLabel);
      const labelEn = readString(entry.labelEn, FIELD_LIMITS.responseLabel);
      const answer = readString(entry.answer, FIELD_LIMITS.responseAnswer, {
        allowLineBreaks: true,
      });

      if (!key.valid || !RESPONSE_KEY_SET.has(key.value)) {
        invalid.push(`${prefix}.key`);
        return;
      }
      if (responseMap.has(key.value)) {
        invalid.push(`${prefix}.key`);
        return;
      }
      if (!labelZh.valid || !labelZh.value) {
        invalid.push(`${prefix}.labelZh`);
      }
      if (!labelEn.valid || !labelEn.value) {
        invalid.push(`${prefix}.labelEn`);
      }
      if (!answer.valid) {
        invalid.push(`${prefix}.answer`);
      }

      totalAnswerChars += answer.value.length;
      responseMap.set(key.value, {
        key: key.value,
        answer: answer.value,
      });
    });
  }

  if (totalAnswerChars > MAX_TOTAL_ANSWER_CHARS) {
    invalid.push("responses.totalLength");
  }

  for (const key of RESPONSE_KEYS) {
    const response = responseMap.get(key);
    if (!response || !response.answer) {
      missing.push(key);
    } else {
      normalized.responses.push(response);
    }
  }

  return {
    missing: [...new Set(missing)],
    invalid: [...new Set(invalid)],
    normalized,
  };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    if (error && error.code === "payload_too_large") {
      return json(res, 413, { ok: false, error: "payload_too_large" });
    }
    return json(res, 400, { ok: false, error: "invalid_json" });
  }

  const { missing, invalid, normalized } = validatePayload(payload);
  if (normalized.website) {
    return json(res, 200, { ok: true, status: "ignored" });
  }
  if (missing.length) {
    return json(res, 400, { ok: false, error: "missing_fields", fields: missing });
  }
  if (invalid.length) {
    return json(res, 400, { ok: false, error: "invalid_fields", fields: invalid });
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPortText = process.env.SMTP_PORT || "465";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const applyToEmail = normalizeEmailAddress(
    process.env.APPLY_TO_EMAIL || "support@youhu.space"
  );
  const applyFromEmail = normalizeEmailAddress(
    process.env.APPLY_FROM_EMAIL || smtpUser || "support@youhu.space"
  );
  const smtpPort = Number(smtpPortText);

  if (
    !smtpHost ||
    !smtpUser ||
    !smtpPass ||
    !applyToEmail ||
    !applyFromEmail ||
    !Number.isInteger(smtpPort) ||
    smtpPort < 1 ||
    smtpPort > 65_535
  ) {
    return json(res, 503, { ok: false, error: "email_not_configured" });
  }

  const message = buildMessage(normalized, normalized.lang);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  try {
    await transporter.sendMail({
      from: applyFromEmail,
      to: applyToEmail,
      subject:
        normalized.lang === "zh"
          ? `Youhu 创世申请 · ${normalized.alias}`
          : `Youhu Founder Application · ${normalized.alias}`,
      replyTo: normalized.email,
      text: message.text,
      html: message.html,
    });
    return json(res, 200, { ok: true, status: "submitted" });
  } catch (error) {
    return json(res, 502, { ok: false, error: "email_send_failed" });
  }
}

module.exports = handler;
module.exports.__test = Object.freeze({
  FIELD_LIMITS,
  QUESTION_LABELS,
  RESPONSE_KEYS,
  buildMessage,
  escapeHtml,
  normalizeEmailAddress,
  validatePayload,
});
