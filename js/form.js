/* ==========================================================
   Модуль 3 — форма заявки: своя валидация и модалка успеха
   на нативном <dialog>. Маску телефона подключает страница (phone-mask.js);
   форма узнаёт об изменении номера по событию «phonemask».
   ========================================================== */

import { calculateEstimate, createEstimateNumber, formatRub } from "./pricing.js";
import { validateName, validatePhone, validateCar, validateEstimate } from "./validation.js";
import { subscribe, getState, resetAll } from "./store.js";

export function initForm() {
  const form = document.getElementById("orderForm");
  const dialog = document.getElementById("successDialog");
  const estimateError = document.getElementById("errorEstimate");
  if (!form || !dialog || !estimateError) {
    return;
  }

  const fields = [
    { key: "name", input: document.getElementById("fieldName"), error: document.getElementById("errorName"), validate: validateName },
    { key: "phone", input: document.getElementById("fieldPhone"), error: document.getElementById("errorPhone"), validate: validatePhone },
    { key: "car", input: document.getElementById("fieldCar"), error: document.getElementById("errorCar"), validate: validateCar }
  ];
  if (fields.some(function (field) {
    return !field.input || !field.error;
  })) {
    return;
  }
  const liveFields = new Set();
  let estimateChecked = false;

  function showFieldError(field, message) {
    field.error.textContent = message;
    field.input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function checkField(field) {
    const message = field.validate(field.input.value);
    showFieldError(field, message);
    if (message) {
      liveFields.add(field.key);
    }
    return message;
  }

  function checkEstimate() {
    const message = validateEstimate(calculateEstimate(getState()).items.length);
    estimateError.textContent = message;
    return message;
  }

  // Маска (её подключают раньше формы) сообщает об изменении номера событием
  const phoneField = fields[1];
  phoneField.input.addEventListener("phonemask", function () {
    if (liveFields.has("phone")) {
      checkField(phoneField);
    }
  });

  for (const field of fields) {
    field.input.addEventListener("blur", function () {
      checkField(field);
    });
    // После первой ошибки поле проверяется на лету (телефон — после маски, через её onChange)
    if (field !== phoneField) {
      field.input.addEventListener("input", function () {
        if (liveFields.has(field.key)) {
          checkField(field);
        }
      });
    }
  }

  // Ошибка «смета пустая» исчезает, как только в смете что-то появилось
  subscribe(function () {
    if (estimateChecked) {
      checkEstimate();
    }
  });

  function resetForm() {
    form.reset();
    liveFields.clear();
    estimateChecked = false;
    estimateError.textContent = "";
    for (const field of fields) {
      field.error.textContent = "";
      field.input.removeAttribute("aria-invalid");
    }
  }

  function openSuccess(values) {
    const estimate = calculateEstimate(getState());
    document.getElementById("modalNumber").textContent = createEstimateNumber(new Date(), Math.random());
    document.getElementById("modalCar").textContent = values.car.trim() + " · " + estimate.carClass.name;
    document.getElementById("modalPhone").textContent = values.phone;
    document.getElementById("modalTotal").textContent = formatRub(estimate.total);
    dialog.showModal();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    let firstInvalid = null;
    for (const field of fields) {
      if (checkField(field) && !firstInvalid) {
        firstInvalid = field.input;
      }
    }
    estimateChecked = true;
    if (checkEstimate() && !firstInvalid) {
      firstInvalid = estimateError;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    openSuccess({ name: fields[0].input.value, phone: fields[1].input.value, car: fields[2].input.value });
    resetForm();
  });

  // «Начать новый расчёт»: очищаем сохранённый выбор и возвращаемся к шагу 1
  const newEstimate = document.getElementById("newEstimate");
  if (newEstimate) {
    newEstimate.addEventListener("click", function () {
      resetAll();
      dialog.close();
      window.location.href = "calculator.html";
    });
  }

  // Закрытие кликом по фону: и нажатие, и отпускание — на самом <dialog>, а не на содержимом
  // (иначе выделение текста, отпущенное за краем окна, закрывало бы модалку)
  let pressedOnBackdrop = false;
  dialog.addEventListener("pointerdown", function (event) {
    pressedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener("click", function (event) {
    if (pressedOnBackdrop && event.target === dialog) {
      dialog.close();
    }
    pressedOnBackdrop = false;
  });
}
