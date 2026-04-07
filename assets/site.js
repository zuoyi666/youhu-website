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
  const flow = document.querySelector("[data-application-flow]");
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
  const retryButton = document.querySelector("[data-status-retry]");
  let currentStep = 0;
  let isSubmitting = false;

  const statusMessages = {
    success: {
      zh: {
        heading: "申请已提交。",
        body: "你的申请已经通过网站提交到 `support@youhu.space`。如果你被选中，我们会通过你留下的邮箱联系你，并发出 Founder 邀请码。",
      },
      en: {
        heading: "Application submitted.",
        body: "Your application has been submitted through the website to `support@youhu.space`. If selected, we will reach out through your email and send your founder invite code.",
      },
    },
    error: {
      zh: {
        heading: "提交失败。",
        body: "这次提交没有成功送达。请返回表单后再试一次，或稍后重新提交。",
      },
      en: {
        heading: "Submission failed.",
        body: "This submission did not go through successfully. Return to the form and try again, or submit later.",
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
    const questions = Array.from(step.querySelectorAll("[data-question]"));
    const questionValidity = questions.every((question) => {
      const requiredGroup = question.dataset.requiredGroup;
      if (requiredGroup) {
        const checked = question.querySelectorAll(`[name="${requiredGroup}"]:checked`);
        if (!checked.length) {
          return false;
        }
      }
      const requiredText = Array.from(
        question.querySelectorAll("[data-required-text]")
      );
      return requiredText.every((field) => {
        const hasValue = field.value.trim().length > 0;
        return hasValue && (!field.checkValidity || field.checkValidity());
      });
    });

    if (!questionValidity) {
      return false;
    }

    const standaloneFields = Array.from(step.querySelectorAll("[data-required-text]"))
      .filter((field) => !field.closest("[data-question]"));

    return standaloneFields.every((field) => {
      const hasValue = field.value.trim().length > 0;
      return hasValue && (!field.checkValidity || field.checkValidity());
    });
  }

  function validateCurrentStep() {
    const step = steps[currentStep];
    if (stepIsValid(step)) {
      return true;
    }
    const alertZh = "请先完整填写当前这一步，并检查邮箱格式是否正确。";
    const alertEn = "Please complete this step and make sure the email format is valid.";
    window.alert(currentLang === "zh" ? alertZh : alertEn);
    return false;
  }

  function collectChoice(scope, name, multiple = false) {
    const inputs = Array.from(scope.querySelectorAll(`[name="${name}"]:checked`));
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
    const responses = Array.from(form.querySelectorAll("[data-question]")).map((question) => {
      const answerKey = question.dataset.answerKey || "";
      const requiredGroup = question.dataset.requiredGroup;
      const allowMultiple = question.dataset.allowMultiple === "true";
      const labelZh = question.dataset.labelZh || "";
      const labelEn = question.dataset.labelEn || "";
      let answer = "";

      if (requiredGroup) {
        answer = collectChoice(question, requiredGroup, allowMultiple);
      } else {
        const field = question.querySelector("[data-required-text]");
        answer = field ? field.value.trim() : "";
      }

      return {
        key: answerKey,
        labelZh,
        labelEn,
        answer,
      };
    });

    return {
      responses,
      alias: collectText("alias"),
      email: collectText("email"),
      referralCode: collectText("referral_code"),
      website: collectText("website"),
      lang: currentLang,
    };
  }

  function updateStatus(kind) {
    const message = statusMessages[kind]?.[currentLang] || statusMessages.error[currentLang];
    if (statusHeading) {
      statusHeading.textContent = message.heading;
    }
    statusBodies.forEach((node) => {
      node.textContent = message.body;
    });
    if (flow) {
      flow.hidden = true;
    }
    if (statusBox) {
      statusBox.classList.add("is-visible");
    }
    if (retryButton) {
      retryButton.style.display = kind === "error" ? "inline-flex" : "none";
    }
  }

  function hideStatus() {
    if (flow) {
      flow.hidden = false;
    }
    if (statusBox) {
      statusBox.classList.remove("is-visible");
    }
    if (retryButton) {
      retryButton.style.display = "none";
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
          return;
        }
        throw new Error(result.error || "submit_failed");
      })
      .catch(() => {
        updateStatus("error");
      })
      .finally(() => {
        setSubmitting(false);
      });
  });

  if (retryButton) {
    retryButton.addEventListener("click", () => {
      hideStatus();
    });
  }

  setStep(0);
})();
