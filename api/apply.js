const nodemailer = require("nodemailer");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 128 * 1024) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
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

function cleanValue(value) {
  return String(value || "").trim();
}

const RESPONSE_KEYS = [
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
];

function buildSection(titleZh, titleEn, value) {
  return {
    zh: `${titleZh}：${value || "未填写"}`,
    en: `${titleEn}: ${value || "Not provided"}`,
  };
}

function buildMessage(payload, lang) {
  const questionSections = payload.responses.map((entry) =>
    buildSection(
      cleanValue(entry.labelZh) || cleanValue(entry.key),
      cleanValue(entry.labelEn) || cleanValue(entry.key),
      cleanValue(entry.answer)
    )
  );

  const metaSections = [
    buildSection("昵称 / 代号", "Alias", payload.alias),
    buildSection("邮箱", "Email", payload.email),
    buildSection("推荐邀请码", "Referral code", payload.referralCode || (lang === "zh" ? "无" : "None")),
    buildSection("浏览语言", "Browsing language", payload.lang === "zh" ? "中文" : "English"),
    buildSection("提交来源", "Source", "youhu.space /apply"),
  ];

  const sections = [...questionSections, ...metaSections];

  return {
    text: sections
      .map((entry) => (lang === "zh" ? entry.zh : entry.en))
      .join("\n\n"),
    html: sections
      .map((entry) => `<p>${lang === "zh" ? entry.zh : entry.en}</p>`)
      .join(""),
  };
}

function validatePayload(payload) {
  const responses = Array.isArray(payload.responses)
    ? payload.responses.map((entry) => ({
        key: cleanValue(entry.key),
        labelZh: cleanValue(entry.labelZh),
        labelEn: cleanValue(entry.labelEn),
        answer: cleanValue(entry.answer),
      }))
    : [];

  const responseMap = new Map(responses.map((entry) => [entry.key, entry]));
  const missingResponses = RESPONSE_KEYS.filter((key) => !cleanValue(responseMap.get(key)?.answer));

  const required = {
    alias: cleanValue(payload.alias),
    email: cleanValue(payload.email || payload.contact),
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key)
    .concat(missingResponses);

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalid = emailPattern.test(required.email) ? [] : ["email"];

  return {
    missing,
    invalid,
    normalized: {
      alias: required.alias,
      email: required.email,
      responses: RESPONSE_KEYS.map((key) => responseMap.get(key)).filter(Boolean),
      referralCode: cleanValue(payload.referralCode),
      lang: cleanValue(payload.lang) === "en" ? "en" : "zh",
      website: cleanValue(payload.website),
    },
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
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
  const smtpPort = Number.parseInt(process.env.SMTP_PORT || "465", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const applyToEmail = process.env.APPLY_TO_EMAIL || "support@youhu.space";
  const applyFromEmail = process.env.APPLY_FROM_EMAIL || smtpUser || applyToEmail;

  if (!smtpHost || !smtpUser || !smtpPass || !applyFromEmail) {
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
};
