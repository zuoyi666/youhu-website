(() => {
  const body = document.body;
  if (!body) {
    return;
  }

  const titleZh = body.dataset.titleZh;
  const titleEn = body.dataset.titleEn;
  const descriptionZh = body.dataset.descriptionZh;
  const descriptionEn = body.dataset.descriptionEn;
  const toggle = document.querySelector("[data-lang-toggle]");
  const metaDescription = document.querySelector('meta[name="description"]');

  function resolveLanguage() {
    const queryLang = new URLSearchParams(window.location.search).get("lang");
    if (queryLang === "zh" || queryLang === "en") {
      return queryLang;
    }
    const stored = window.localStorage.getItem("youhu-site-lang");
    if (stored === "zh" || stored === "en") {
      return stored;
    }
    return "zh";
  }

  function applyLanguage(lang) {
    body.dataset.lang = lang;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem("youhu-site-lang", lang);
    if (toggle) {
      toggle.textContent = lang === "zh" ? "EN" : "中文";
      toggle.setAttribute(
        "aria-label",
        lang === "zh" ? "Switch to English" : "切换到中文"
      );
    }
    if (titleZh && titleEn) {
      document.title = lang === "zh" ? titleZh : titleEn;
    }
    if (metaDescription && descriptionZh && descriptionEn) {
      metaDescription.setAttribute(
        "content",
        lang === "zh" ? descriptionZh : descriptionEn
      );
    }
  }

  let currentLang = resolveLanguage();
  applyLanguage(currentLang);

  if (toggle) {
    toggle.addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      applyLanguage(currentLang);
    });
  }

  const form = document.querySelector("[data-apply-form]");
  if (!form) {
    return;
  }

  const steps = Array.from(form.querySelectorAll("[data-step]"));
  const backButton = form.querySelector("[data-step-back]");
  const nextButton = form.querySelector("[data-step-next]");
  const submitButton = form.querySelector("[data-step-submit]");
  const progressFill = form.querySelector("[data-progress-fill]");
  const progressCurrent = form.querySelector("[data-progress-current]");
  const progressTotal = form.querySelector("[data-progress-total]");
  const statusBox = document.querySelector("[data-application-status]");
  const statusHeading = statusBox?.querySelector("[data-status-heading]");
  const statusBodies = Array.from(
    statusBox?.querySelectorAll("[data-status-body]") || []
  );
  const preview = document.querySelector("[data-application-preview]");
  const copyButton = document.querySelector("[data-copy-application]");
  const mailtoLink = document.querySelector("[data-mailto-link]");
  let currentStep = 0;
  let draftText = "";
  let isSubmitting = false;

  const statusMessages = {
    success: {
      zh: {
        heading: "申请已提交。",
        body: "你的申请已经通过网站提交到 `support@youhu.space`。如果你被选中，我们会再联系你并发出 Founder 邀请码。",
      },
      en: {
        heading: "Application submitted.",
        body: "Your application has been submitted through the website to `support@youhu.space`. If selected, we will follow up and send your founder invite code.",
      },
    },
    fallback: {
      zh: {
        heading: "网站已生成申请草稿。",
        body: "当前环境尚未完成邮件发送配置。你可以复制下面的内容，或直接用邮件发送到 `support@youhu.space`。",
      },
      en: {
        heading: "Your application draft is ready.",
        body: "Email delivery is not configured in this environment yet. Copy the application below or send it manually to `support@youhu.space`.",
      },
    },
  };

  function setStep(index) {
    currentStep = index;
    steps.forEach((step, idx) => {
      step.classList.toggle("is-active", idx === index);
    });
    const progress = ((index + 1) / steps.length) * 100;
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }
    if (progressCurrent) {
      progressCurrent.textContent = String(index + 1).padStart(2, "0");
    }
    if (progressTotal) {
      progressTotal.textContent = String(steps.length).padStart(2, "0");
    }
    if (backButton) {
      backButton.disabled = index === 0;
    }
    const isLastStep = index === steps.length - 1;
    if (nextButton) {
      nextButton.style.display = isLastStep ? "none" : "inline-flex";
    }
    if (submitButton) {
      submitButton.style.display = isLastStep ? "inline-flex" : "none";
      submitButton.disabled = isSubmitting;
    }
  }

  function visibleText(node) {
    if (!node) {
      return "";
    }
    return node.innerText.replace(/\s+/g, " ").trim();
  }

  function stepIsValid(step) {
    const requiredGroup = step.dataset.requiredGroup;
    if (requiredGroup) {
      const checked = form.querySelectorAll(`[name="${requiredGroup}"]:checked`);
      if (!checked.length) {
        return false;
      }
    }
    const requiredText = Array.from(step.querySelectorAll("[data-required-text]"));
    return requiredText.every((field) => field.value.trim().length > 0);
  }

  function validateCurrentStep() {
    const step = steps[currentStep];
    if (stepIsValid(step)) {
      return true;
    }
    const alertZh = "请先完成当前这一步。";
    const alertEn = "Please complete this step before continuing.";
    window.alert(currentLang === "zh" ? alertZh : alertEn);
    return false;
  }

  function collectChoice(name, multiple = false) {
    const inputs = Array.from(form.querySelectorAll(`[name="${name}"]:checked`));
    if (!inputs.length) {
      return "";
    }
    const values = inputs.map((input) => {
      const card = input.closest(".choice");
      return visibleText(card);
    });
    return multiple ? values.join(currentLang === "zh" ? "；" : "; ") : values[0];
  }

  function collectText(name) {
    const field = form.querySelector(`[name="${name}"]`);
    return field ? field.value.trim() : "";
  }

  function buildPayload() {
    return {
      rituals: collectChoice("rituals", true),
      frequency: collectChoice("frequency"),
      moment: collectChoice("moment"),
      feedbackCommitment: collectChoice("feedback_commitment"),
      selfDiscovery: collectText("self_discovery"),
      alias: collectText("alias"),
      contact: collectText("contact"),
      referralCode: collectText("referral_code"),
      website: collectText("website"),
      lang: currentLang,
    };
  }

  function buildDraft() {
    const payload = buildPayload();
    const lines =
      payload.lang === "zh"
        ? [
            "Youhu 创世申请",
            "",
            `1. 过去 30 天的方式：${payload.rituals}`,
            `2. 使用频率：${payload.frequency}`,
            `3. 最想被接住的时刻：${payload.moment}`,
            `4. 是否愿意连续 3 周反馈：${payload.feedbackCommitment}`,
            `5. 最想更认识的自己：${payload.selfDiscovery}`,
            "",
            `昵称 / 代号：${payload.alias}`,
            `联系方式：${payload.contact}`,
            `推荐邀请码：${payload.referralCode || "无"}`,
            `浏览语言：中文`,
            `提交方式：youhu.space 申请页面`,
          ]
        : [
            "Youhu Founder Application",
            "",
            `1. Tools used in the last 30 days: ${payload.rituals}`,
            `2. Usage frequency: ${payload.frequency}`,
            `3. When I most want to be held: ${payload.moment}`,
            `4. Commitment to 3 weeks of feedback: ${payload.feedbackCommitment}`,
            `5. The part of myself I want to understand better: ${payload.selfDiscovery}`,
            "",
            `Alias: ${payload.alias}`,
            `Contact: ${payload.contact}`,
            `Referral code: ${payload.referralCode || "None"}`,
            `Browsing language: English`,
            `Submission route: youhu.space application page`,
          ];

    return lines.join("\n");
  }

  function mailtoForDraft() {
    const subject =
      currentLang === "zh"
        ? "Youhu 创世申请"
        : "Youhu Founder Application";
    return `mailto:support@youhu.space?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(draftText)}`;
  }

  function updateStatus(kind) {
    const message = statusMessages[kind]?.[currentLang] || statusMessages.fallback[currentLang];
    if (statusHeading) {
      statusHeading.textContent = message.heading;
    }
    statusBodies.forEach((node) => {
      node.textContent = message.body;
    });
    if (statusBox) {
      statusBox.classList.add("is-visible");
    }
    if (preview) {
      preview.textContent = draftText;
    }
    if (mailtoLink) {
      mailtoLink.setAttribute("href", mailtoForDraft());
    }
  }

  function setSubmitting(nextValue) {
    isSubmitting = nextValue;
    if (submitButton) {
      submitButton.disabled = nextValue;
      submitButton.textContent =
        nextValue
          ? currentLang === "zh"
            ? "提交中..."
            : "Submitting..."
          : currentLang === "zh"
            ? "提交申请"
            : "Submit Application";
    }
    if (nextButton) {
      nextButton.disabled = nextValue;
    }
    if (backButton) {
      backButton.disabled = nextValue || currentStep === 0;
    }
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (!validateCurrentStep()) {
        return;
      }
      setStep(Math.min(currentStep + 1, steps.length - 1));
    });
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      setStep(Math.max(currentStep - 1, 0));
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateCurrentStep()) {
      return;
    }
    draftText = buildDraft();
    const payload = buildPayload();
    setSubmitting(true);
    fetch("/api/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.ok) {
          updateStatus("success");
          form.reset();
          setStep(0);
          return;
        }
        throw new Error(result.error || "submit_failed");
      })
      .catch(() => {
        updateStatus("fallback");
      })
      .finally(() => {
        setSubmitting(false);
      });
  });

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      if (!draftText) {
        draftText = buildDraft();
        if (preview) {
          preview.textContent = draftText;
        }
        if (statusBox) {
          statusBox.classList.add("is-visible");
        }
      }
      try {
        await navigator.clipboard.writeText(draftText);
        copyButton.textContent = currentLang === "zh" ? "已复制" : "Copied";
      } catch (_error) {
        window.alert(
          currentLang === "zh"
            ? "复制失败，请手动复制下方内容。"
            : "Copy failed. Please copy the text below manually."
        );
      }
    });
  }

  setStep(0);
})();
