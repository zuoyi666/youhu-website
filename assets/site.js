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
  const preview = document.querySelector("[data-application-preview]");
  const copyButton = document.querySelector("[data-copy-application]");
  let currentStep = 0;
  let draftText = "";

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

  function buildDraft() {
    const lines =
      currentLang === "zh"
        ? [
            "Youhu 创世申请",
            "",
            `1. 过去 30 天的方式：${collectChoice("rituals", true)}`,
            `2. 使用频率：${collectChoice("frequency")}`,
            `3. 最想被接住的时刻：${collectChoice("moment")}`,
            `4. 是否愿意连续 3 周反馈：${collectChoice("feedback_commitment")}`,
            `5. 最想更认识的自己：${collectText("self_discovery")}`,
            "",
            `昵称 / 代号：${collectText("alias")}`,
            `联系方式：${collectText("contact")}`,
            `推荐邀请码：${collectText("referral_code") || "无"}`,
            `浏览语言：中文`,
            `提交方式：youhu.space 邮件申请`,
          ]
        : [
            "Youhu Founder Application",
            "",
            `1. Tools used in the last 30 days: ${collectChoice("rituals", true)}`,
            `2. Usage frequency: ${collectChoice("frequency")}`,
            `3. When I most want to be held: ${collectChoice("moment")}`,
            `4. Commitment to 3 weeks of feedback: ${collectChoice("feedback_commitment")}`,
            `5. The part of myself I want to understand better: ${collectText("self_discovery")}`,
            "",
            `Alias: ${collectText("alias")}`,
            `Contact: ${collectText("contact")}`,
            `Referral code: ${collectText("referral_code") || "None"}`,
            `Browsing language: English`,
            `Submission route: youhu.space email application`,
          ];

    return lines.join("\n");
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
    const subject =
      currentLang === "zh"
        ? "Youhu 创世申请"
        : "Youhu Founder Application";
    const mailto = `mailto:support@youhu.space?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(draftText)}`;
    if (preview) {
      preview.textContent = draftText;
    }
    if (statusBox) {
      statusBox.classList.add("is-visible");
    }
    window.location.href = mailto;
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
