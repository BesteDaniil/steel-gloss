/* ==========================================================
   Маска телефона на поле ввода: связывает DOM-события
   с чистыми функциями из validation.js.
   ========================================================== */

import { maskPhoneInput, maskPhonePaste, deleteDigitBefore, deleteDigitAfter, extractPhoneDigits } from "./validation.js";

const PHONE_PREFIX = "+7 (";

/* onChange вызывается после каждого изменения значения */
export function attachPhoneMask(input, onChange) {
  let valueBefore = "";
  let caretBefore = 0;

  function apply(result) {
    input.value = result.value;
    if (document.activeElement === input) {
      input.setSelectionRange(result.caret, result.caret);
    }
    onChange();
  }

  // Курсор не пускаем внутрь «+7 (» — иначе цифра встанет перед кодом страны
  function keepCaretAfterPrefix() {
    if (input.value.startsWith(PHONE_PREFIX) && input.selectionStart < PHONE_PREFIX.length && input.selectionStart === input.selectionEnd) {
      input.setSelectionRange(PHONE_PREFIX.length, PHONE_PREFIX.length);
    }
  }

  // Удаление перехватываем до браузера: иначе Backspace по «) » или «-» стирает разделитель,
  // маска возвращает его обратно — и курсор «застревает»
  input.addEventListener("beforeinput", function (event) {
    valueBefore = input.value;
    caretBefore = input.selectionStart;
    const isBackward = event.inputType === "deleteContentBackward";
    const isForward = event.inputType === "deleteContentForward";
    if (!isBackward && !isForward) {
      return;
    }
    if (!event.cancelable || input.selectionStart !== input.selectionEnd) {
      return;
    }
    event.preventDefault();
    apply(isBackward ? deleteDigitBefore(input.value, caretBefore) : deleteDigitAfter(input.value, caretBefore));
  });

  input.addEventListener("paste", function (event) {
    const text = event.clipboardData ? event.clipboardData.getData("text") : "";
    if (!text) {
      return;
    }
    event.preventDefault();
    apply(maskPhonePaste(input.value, input.selectionStart, input.selectionEnd, text));
  });

  input.addEventListener("input", function (event) {
    // Страховка для клавиатур, где beforeinput нельзя отменить (часть Android IME):
    // браузер стёр только разделитель — стираем цифру сами
    const deletedBackward = event.inputType === "deleteContentBackward";
    if (deletedBackward && valueBefore && extractPhoneDigits(input.value).digits === extractPhoneDigits(valueBefore).digits) {
      apply(deleteDigitBefore(valueBefore, caretBefore));
      return;
    }
    apply(maskPhoneInput(input.value, input.selectionStart));
  });

  input.addEventListener("focus", function () {
    if (input.value === "") {
      input.value = PHONE_PREFIX;
    }
    requestAnimationFrame(function () {
      if (input.value === PHONE_PREFIX) {
        input.setSelectionRange(PHONE_PREFIX.length, PHONE_PREFIX.length);
      }
      keepCaretAfterPrefix();
    });
  });
  input.addEventListener("click", keepCaretAfterPrefix);
  input.addEventListener("keyup", keepCaretAfterPrefix);

  input.addEventListener("blur", function () {
    if (input.value === PHONE_PREFIX) {
      input.value = "";
    }
  });
}
