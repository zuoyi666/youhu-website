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
  const statusKicker = statusBox?.querySelector("[data-status-kicker]");
  const statusHeading = statusBox?.querySelector("[data-status-heading]");
  const statusBodies = Array.from(
    statusBox?.querySelectorAll("[data-status-body]") || []
  );
  const statusNote = statusBox?.querySelector("[data-status-note]");
  const foundersLink = document.querySelector("[data-status-founders]");
  const retryButton = document.querySelector("[data-status-retry]");
  let currentStep = 0;
  let isSubmitting = false;

  const statusMessages = {
    success: {
      kicker: {
        zh: "申请已送达",
        en: "Application Received",
      },
      heading: {
        zh: "申请已经进入海面之下。",
        en: "Your application has entered the water.",
      },
      body: {
        zh: "我们已经收到你的整份问卷。接下来，我们会认真阅读这 20 道回答，而不只是看几个标签。",
        en: "We have received your full questionnaire. From here, we read the 20 answers carefully instead of reducing you to a few labels.",
      },
      note: {
        zh: "如果你被选中，我们会通过邮箱发出 Founder 邀请、后续说明，以及对应编号的激活方式。",
        en: "If selected, we will email your founder invite, next steps, and the activation path for your numbered seat.",
      },
    },
    error: {
      kicker: {
        zh: "提交未送达",
        en: "Submission Error",
      },
      heading: {
        zh: "提交失败。",
        en: "Submission failed.",
      },
      body: {
        zh: "这次提交没有成功送达。请返回表单后再试一次，或稍后重新提交。",
        en: "This submission did not go through successfully. Return to the form and try again, or submit later.",
      },
      note: {
        zh: "如果你已经写完，先不要担心，返回表单后内容仍然会保留在当前页面里，直到你刷新。",
        en: "If you already finished the questionnaire, do not worry. Your answers stay on the page until you refresh.",
      },
    },
  };

  function setLocalizedCopy(node, copy) {
    if (!node || !copy) {
      return;
    }

    const zhNode = node.classList.contains("lang-zh")
      ? node
      : node.querySelector(".lang-zh");
    const enNode = node.classList.contains("lang-en")
      ? node
      : node.querySelector(".lang-en");

    if (zhNode || enNode) {
      if (zhNode) {
        zhNode.textContent = copy.zh;
      }
      if (enNode) {
        enNode.textContent = copy.en;
      }
      return;
    }

    node.textContent = currentLang === "zh" ? copy.zh : copy.en;
  }

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
    const message = statusMessages[kind] || statusMessages.error;
    setLocalizedCopy(statusKicker, message.kicker);
    setLocalizedCopy(statusHeading, message.heading);
    statusBodies.forEach((node) => {
      setLocalizedCopy(node, message.body);
    });
    setLocalizedCopy(statusNote, message.note);
    if (flow) {
      flow.hidden = true;
    }
    if (statusBox) {
      statusBox.dataset.state = kind;
      statusBox.classList.add("is-visible");
    }
    if (retryButton) {
      retryButton.style.display = kind === "error" ? "inline-flex" : "none";
    }
    if (foundersLink) {
      foundersLink.style.display = kind === "success" ? "inline-flex" : "none";
    }
  }

  function hideStatus() {
    if (flow) {
      flow.hidden = false;
    }
    if (statusBox) {
      statusBox.dataset.state = "";
      statusBox.classList.remove("is-visible");
    }
    if (retryButton) {
      retryButton.style.display = "none";
    }
    if (foundersLink) {
      foundersLink.style.display = "none";
    }
  }

  function setSubmitting(nextValue) {
    isSubmitting = nextValue;
    if (submitButton) {
      submitButton.disabled = nextValue;
      setLocalizedCopy(
        submitButton,
        nextValue
          ? { zh: "提交中...", en: "Submitting..." }
          : { zh: "提交申请", en: "Submit Application" }
      );
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
