(function () {
  "use strict";

  const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
  const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const WHATSAPP_PHONE = "79605507571";
  const pad = (value) => String(value).padStart(2, "0");

  function localDateISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (!digits) return "";
    if (digits[0] === "8") digits = `7${digits.slice(1)}`;
    if (digits[0] !== "7") digits = `7${digits}`;
    return digits;
  }

  function formatPhone(value) {
    const digits = normalizePhone(value);
    if (!digits) return "";
    let result = "+7";
    if (digits.length > 1) result += ` (${digits.slice(1, 4)}`;
    if (digits.length >= 5) result += `) ${digits.slice(4, 7)}`;
    if (digits.length >= 8) result += `-${digits.slice(7, 9)}`;
    if (digits.length >= 10) result += `-${digits.slice(9, 11)}`;
    return result;
  }

  function isValidPhone(value) {
    const digits = normalizePhone(value);
    return digits.length === 11 && digits[0] === "7";
  }

  function fieldError(form, name, message) {
    const error = form.querySelector(`[data-error-for="${name}"]`);
    const wrapper = form.querySelector(`[data-field="${name}"]`);
    if (error) {
      error.textContent = message;
      error.classList.add("is-visible");
    }
    if (wrapper) wrapper.classList.add("is-invalid");
  }

  function clearFieldError(form, name) {
    const error = form.querySelector(`[data-error-for="${name}"]`);
    const wrapper = form.querySelector(`[data-field="${name}"]`);
    if (error) {
      error.textContent = "";
      error.classList.remove("is-visible");
    }
    if (wrapper) wrapper.classList.remove("is-invalid");
  }

  function clearErrors(form) {
    form.querySelectorAll(".is-invalid").forEach((element) => element.classList.remove("is-invalid"));
    form.querySelectorAll("[data-error-for]").forEach((element) => {
      element.textContent = "";
      element.classList.remove("is-visible");
    });
    const hint = form.querySelector(".time-hint");
    if (hint) hint.classList.remove("is-error");
  }

  function focusFirstError(form) {
    const target = form.querySelector(
      '.is-invalid input:not([type="hidden"]):not([type="file"]), .is-invalid select, .is-invalid textarea, .rating.is-invalid input, .consent.is-invalid input, .field.is-invalid .time-slot:not(:disabled)'
    );
    if (target) target.focus({ preventScroll: false });
  }

  function setStatus(form, type, message) {
    const status = form.querySelector(".form__status");
    if (!status) return;
    status.className = `form__status is-visible is-${type}`;
    status.textContent = message;
  }

  function setFallbackStatus(form, message, whatsappUrl) {
    const status = form.querySelector(".form__status");
    if (!status) return;
    status.className = "form__status is-visible is-error";
    status.textContent = message;
    const link = document.createElement("a");
    link.href = whatsappUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Открыть WhatsApp";
    status.append(" ", link);
  }

  function hideStatus(form) {
    const status = form.querySelector(".form__status");
    if (!status) return;
    status.className = "form__status";
    status.textContent = "";
  }

  /* Tabs */
  const tabs = Array.from(document.querySelectorAll(".form-tab"));
  const tablist = document.querySelector(".form-tabs");

  function activateTab(tab, focus) {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(item.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab, false));
  });

  if (tablist) {
    tablist.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(document.activeElement);
      if (current === -1) return;
      let next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== null) {
        event.preventDefault();
        activateTab(tabs[next], true);
      }
    });
  }

  /* Phone input */
  document.querySelectorAll('input[type="tel"]').forEach((input) => {
    input.addEventListener("input", () => {
      const formatted = formatPhone(input.value);
      if (input.value !== formatted) input.value = formatted;
    });
  });

  /* Date and time slots */
  const bookingForm = document.getElementById("booking-form");
  const dateInput = document.getElementById("booking-date");
  const slotsContainer = document.getElementById("time-slots");
  const timeInput = document.getElementById("booking-time");
  const timeHint = document.getElementById("time-hint");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = localDateISO(today);
  const latestDate = new Date(today);
  latestDate.setDate(latestDate.getDate() + 60);

  if (dateInput) {
    dateInput.min = todayISO;
    dateInput.max = localDateISO(latestDate);
  }

  function clearTimeSelection() {
    if (timeInput) timeInput.value = "";
    if (slotsContainer) {
      slotsContainer.querySelectorAll(".time-slot").forEach((slot) => slot.setAttribute("aria-checked", "false"));
    }
  }

  function chooseTime(button, value) {
    if (!timeInput || !timeHint) return;
    clearTimeSelection();
    timeInput.value = value;
    button.setAttribute("aria-checked", "true");
    timeHint.classList.remove("is-error");
    timeHint.textContent = `Выбрано: ${value}`;
    clearFieldError(bookingForm, "time");
  }

  function buildTimeSlots(dateValue) {
    if (!slotsContainer || !timeHint || !timeInput) return;
    slotsContainer.innerHTML = "";
    clearTimeSelection();

    const isToday = dateValue === todayISO;
    const now = new Date();
    const earliest = now.getHours() * 60 + now.getMinutes() + 60;
    let available = 0;

    for (let minutes = 10 * 60; minutes < 20 * 60; minutes += 30) {
      const value = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "time-slot";
      button.textContent = value;
      button.dataset.time = value;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");
      button.disabled = !dateValue || (isToday && minutes < earliest);
      button.addEventListener("click", () => chooseTime(button, value));
      slotsContainer.append(button);
      if (!button.disabled) available += 1;
    }

    if (!dateValue) {
      timeHint.textContent = "Сначала выберите дату.";
      return;
    }

    if (!available) {
      timeHint.textContent = "На этот день свободного времени не осталось. Выберите другую дату.";
      timeHint.classList.add("is-error");
      return;
    }

    timeHint.textContent = isToday
      ? "Доступно время не раньше чем через час."
      : "Выберите удобное время.";
  }

  if (dateInput) {
    dateInput.addEventListener("change", () => {
      buildTimeSlots(dateInput.value);
      clearFieldError(bookingForm, "date");
      clearFieldError(bookingForm, "time");
    });
  }

  if (slotsContainer) buildTimeSlots("");

  /* Photo upload */
  const photoInput = document.getElementById("booking-photo");
  const drop = document.getElementById("upload-drop");
  const preview = document.getElementById("upload-preview");
  const previewImage = document.getElementById("upload-image");
  const previewName = document.getElementById("upload-name");
  const removePhoto = document.getElementById("upload-remove");
  let previewUrl = null;

  function clearPhoto() {
    if (photoInput) photoInput.value = "";
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    if (previewImage) previewImage.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    if (preview) preview.hidden = true;
    if (drop) drop.hidden = false;
    clearFieldError(bookingForm, "photo");
  }

  function handlePhoto(file) {
    if (!file) {
      clearPhoto();
      return;
    }
    if (!PHOTO_TYPES.includes(file.type)) {
      clearPhoto();
      fieldError(bookingForm, "photo", "Можно прикрепить только JPG, PNG или WebP.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      clearPhoto();
      fieldError(bookingForm, "photo", "Файл слишком большой. Максимум 8 МБ.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    if (previewImage) previewImage.src = previewUrl;
    if (previewName) previewName.textContent = file.name;
    if (preview) preview.hidden = false;
    if (drop) drop.hidden = true;
    clearFieldError(bookingForm, "photo");
  }

  if (photoInput) {
    photoInput.addEventListener("change", () => handlePhoto(photoInput.files && photoInput.files[0]));
  }

  if (drop) {
    ["dragenter", "dragover"].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.remove("is-dragover");
      });
    });
    drop.addEventListener("drop", (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file || !photoInput) return;
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        photoInput.files = transfer.files;
        handlePhoto(file);
      } catch (error) {
        handlePhoto(file);
      }
    });
  }

  if (removePhoto) removePhoto.addEventListener("click", clearPhoto);

  /* Rating */
  const ratingInputs = Array.from(document.querySelectorAll('#rating-stars input[name="rating"]'));
  const starLabels = Array.from(document.querySelectorAll(".rating__star"));

  function paintRating(value) {
    starLabels.forEach((label) => {
      const labelValue = Number(label.querySelector("input").value);
      label.classList.toggle("is-active", labelValue <= value);
    });
  }

  ratingInputs.forEach((input) => {
    input.addEventListener("change", () => {
      paintRating(Number(input.value));
      clearFieldError(document.getElementById("feedback-form"), "rating");
    });
  });

  function resetRating() {
    paintRating(0);
  }

  /* Validation */
  function validateBooking(form) {
    clearErrors(form);
    let valid = true;
    const fail = (name, message) => {
      fieldError(form, name, message);
      valid = false;
    };

    const name = form.querySelector('[name="name"]').value.trim();
    const phone = form.querySelector('[name="phone"]').value.trim();
    const service = form.querySelector('[name="service"]').value;
    const date = form.querySelector('[name="date"]').value;
    const time = form.querySelector('[name="time"]').value;
    const consent = form.querySelector('[name="consent"]').checked;

    if (name.length < 2) fail("name", "Напишите, как к вам обращаться.");
    if (!isValidPhone(phone)) fail("phone", "Введите телефон в формате +7 (___) ___-__-__.");
    if (!service) fail("service", "Выберите услугу.");
    if (!date) {
      fail("date", "Выберите дату визита.");
    } else if (date < todayISO) {
      fail("date", "Дата уже прошла. Выберите другой день.");
    }
    if (!time) {
      fail("time", "Выберите удобное время.");
      if (timeHint) timeHint.classList.add("is-error");
    }
    if (photoInput && photoInput.files && photoInput.files[0]) {
      const file = photoInput.files[0];
      if (!PHOTO_TYPES.includes(file.type)) fail("photo", "Можно прикрепить только JPG, PNG или WebP.");
      if (file.size > MAX_PHOTO_SIZE) fail("photo", "Файл слишком большой. Максимум 8 МБ.");
    }
    if (!consent) fail("consent", "Подтвердите согласие на обработку данных.");

    if (!valid) {
      focusFirstError(form);
      setStatus(form, "error", "Проверьте выделенные поля и попробуйте ещё раз.");
    }
    return valid;
  }

  function validateFeedback(form) {
    clearErrors(form);
    let valid = true;
    const fail = (name, message) => {
      fieldError(form, name, message);
      valid = false;
    };

    const name = form.querySelector('[name="name"]').value.trim();
    const message = form.querySelector('[name="message"]').value.trim();
    const rating = form.querySelector('input[name="rating"]:checked');
    const consent = form.querySelector('[name="consent"]').checked;

    if (name.length < 2) fail("name", "Напишите, как к вам обращаться.");
    if (!rating) fail("rating", "Поставьте оценку от 1 до 5.");
    if (message.length < 10) fail("message", "Расскажите чуть подробнее — минимум 10 символов.");
    if (!consent) fail("consent", "Подтвердите согласие на обработку данных.");

    if (!valid) {
      focusFirstError(form);
      setStatus(form, "error", "Проверьте выделенные поля и попробуйте ещё раз.");
    }
    return valid;
  }

  /* WhatsApp fallback */
  function humanDate(value) {
    if (!value) return "—";
    const date = new Date(`${value}T12:00:00`);
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }

  function whatsAppUrlFor(form) {
    const data = new FormData(form);
    const type = data.get("type");
    const lines = [];
    if (type === "booking") {
      const service = data.get("service") === "haircut_beard" ? "Стрижка + борода — 550 ₽" : "Стрижка — 500 ₽";
      lines.push("Заявка на стрижку");
      lines.push(`Имя: ${data.get("name") || "—"}`);
      lines.push(`Телефон: ${data.get("phone") || "—"}`);
      lines.push(`Услуга: ${service}`);
      lines.push(`Дата: ${humanDate(data.get("date"))}`);
      lines.push(`Время: ${data.get("time") || "—"}`);
      if (data.get("comment")) lines.push(`Комментарий: ${data.get("comment")}`);
      if (photoInput && photoInput.files && photoInput.files[0]) lines.push("Фото прически прикреплю в чате.");
    } else {
      lines.push("Отзыв о стрижке");
      lines.push(`Имя: ${data.get("name") || "—"}`);
      if (data.get("phone")) lines.push(`Контакт: ${data.get("phone")}`);
      lines.push(`Оценка: ${data.get("rating") || "—"} из 5`);
      lines.push(`Отзыв: ${data.get("message") || "—"}`);
    }
    return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  /* Submission */
  async function sendForm(form) {
    const button = form.querySelector('button[type="submit"]');
    const originalText = button ? button.textContent : "";
    hideStatus(form);
    if (button) {
      button.disabled = true;
      button.textContent = "Отправляем…";
      button.classList.add("is-loading");
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(form.getAttribute("action"), {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error("unsupported-endpoint");
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const error = new Error(data.message || "Не удалось отправить форму.");
        error.isServerError = true;
        throw error;
      }

      const isBooking = form.id === "booking-form";
      setStatus(
        form,
        "success",
        data.message || (isBooking
          ? "Заявка отправлена! Наталья перезвонит, чтобы подтвердить время."
          : "Спасибо за отзыв! Он отправлен Наталье.")
      );

      form.reset();
      if (isBooking) {
        clearPhoto();
        if (dateInput) dateInput.value = "";
        buildTimeSlots("");
      } else {
        resetRating();
      }
      clearErrors(form);
    } catch (error) {
      if (error.isServerError) {
        setStatus(form, "error", error.message);
      } else {
        setFallbackStatus(
          form,
          "Не удалось отправить автоматически. Текст заявки уже готов — отправьте его в WhatsApp, а фото прикрепите в чате.",
          whatsAppUrlFor(form)
        );
      }
    } finally {
      window.clearTimeout(timeout);
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
        button.classList.remove("is-loading");
      }
    }
  }

  if (bookingForm) {
    bookingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (validateBooking(bookingForm)) sendForm(bookingForm);
    });
  }

  const feedbackForm = document.getElementById("feedback-form");
  if (feedbackForm) {
    feedbackForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (validateFeedback(feedbackForm)) sendForm(feedbackForm);
    });
  }

  /* Clear a field error as soon as the visitor edits it */
  document.querySelectorAll(".form").forEach((form) => {
    form.addEventListener("input", (event) => {
      const wrapper = event.target.closest("[data-field]");
      if (wrapper) clearFieldError(form, wrapper.dataset.field);
      hideStatus(form);
    });
    form.addEventListener("change", (event) => {
      const wrapper = event.target.closest("[data-field]");
      if (wrapper) clearFieldError(form, wrapper.dataset.field);
      hideStatus(form);
    });
  });
})();
