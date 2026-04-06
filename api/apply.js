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

function buildSection(titleZh, titleEn, value) {
  return {
    zh: `${titleZh}：${value || "未填写"}`,
    en: `${titleEn}: ${value || "Not provided"}`,
  };
}

function buildMessage(payload, lang) {
  const sections = [
    buildSection("1. 过去 30 天的方式", "1. Rituals in the last 30 days", payload.rituals),
    buildSection("2. 使用频率", "2. Usage frequency", payload.frequency),
    buildSection("3. 最想被接住的时刻", "3. When I most want to be held", payload.moment),
    buildSection("4. 是否愿意连续 3 周反馈", "4. Feedback commitment", payload.feedbackCommitment),
    buildSection("5. 最想更认识的自己", "5. The part of myself I want to understand better", payload.selfDiscovery),
    buildSection("昵称 / 代号", "Alias", payload.alias),
    buildSection("联系方式", "Contact", payload.contact),
    buildSection("推荐邀请码", "Referral code", payload.referralCode || (lang === "zh" ? "无" : "None")),
    buildSection("浏览语言", "Browsing language", payload.lang === "zh" ? "中文" : "English"),
    buildSection("提交来源", "Source", "youhu.space /apply"),
  ];

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
  const required = {
    rituals: cleanValue(payload.rituals),
    frequency: cleanValue(payload.frequency),
    moment: cleanValue(payload.moment),
    feedbackCommitment: cleanValue(payload.feedbackCommitment),
    selfDiscovery: cleanValue(payload.selfDiscovery),
    alias: cleanValue(payload.alias),
    contact: cleanValue(payload.contact),
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    missing,
    normalized: {
      ...required,
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

  const { missing, normalized } = validatePayload(payload);
  if (normalized.website) {
    return json(res, 200, { ok: true, status: "ignored" });
  }
  if (missing.length) {
    return json(res, 400, { ok: false, error: "missing_fields", fields: missing });
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
      replyTo: normalized.contact,
      text: message.text,
      html: message.html,
    });
    return json(res, 200, { ok: true, status: "submitted" });
  } catch (error) {
    return json(res, 502, { ok: false, error: "email_send_failed" });
  }
};
