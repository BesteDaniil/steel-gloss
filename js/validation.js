/* ==========================================================
   Маска телефона и правила формы. Только чистые функции — без DOM.
   Формат: +7 (999) 123-45-67. «Национальные» цифры — 10 цифр после +7.
   ========================================================== */

const PREFIX = "+7 (";
const NATIONAL_LENGTH = 10;
export const CAR_MAX_LENGTH = 60;

/* Цифры номера без кода страны (ввод с 8, 7, +7). Ведущая 7/8 — код страны, только если:
   строка начинается с «+7» или «7 (» / «8 (», номер набран целиком (11 цифр)
   или это первая набранная цифра. Иначе «800) 555…» после вырезанного префикса
   потерял бы свою 8 */
export function extractPhoneDigits(raw) {
  const text = String(raw);
  let digits = text.replace(/\D/g, "");
  const startsWithCode = /^\s*(\+\s*7|[78]\s*\()/.test(text);
  const looksLikeCode = digits.length > 0 && (digits[0] === "7" || digits[0] === "8") && (digits.length === 1 || digits.length > NATIONAL_LENGTH);
  const hasCountryCode = startsWithCode || looksLikeCode;
  if (hasCountryCode) {
    digits = digits.slice(1);
  }
  return { digits: digits.slice(0, NATIONAL_LENGTH), hasCountryCode: hasCountryCode };
}

/* Форматирование по мере ввода: разделители появляются только перед следующей цифрой,
   поэтому в конце строки никогда не висит «) » или «-», о которые спотыкается Backspace */
export function formatPhone(digits) {
  if (digits.length === 0) {
    return "";
  }
  let result = PREFIX + digits.slice(0, 3);
  if (digits.length > 3) {
    result += ") " + digits.slice(3, 6);
  }
  if (digits.length > 6) {
    result += "-" + digits.slice(6, 8);
  }
  if (digits.length > 8) {
    result += "-" + digits.slice(8, 10);
  }
  return result;
}

/* Позиция курсора сразу после N-й национальной цифры отформатированной строки */
export function caretAfterDigit(formatted, digitCount) {
  if (digitCount <= 0) {
    return formatted.length === 0 ? 0 : PREFIX.length;
  }
  let seen = 0;
  for (let index = PREFIX.length; index < formatted.length; index++) {
    if (/\d/.test(formatted[index])) {
      seen++;
      if (seen === digitCount) {
        return index + 1;
      }
    }
  }
  return formatted.length;
}

/* Сколько национальных цифр стоит левее позиции в уже отформатированной строке */
function nationalDigitsBefore(formatted, position) {
  let count = 0;
  for (let index = PREFIX.length; index < Math.min(position, formatted.length); index++) {
    if (/\d/.test(formatted[index])) {
      count++;
    }
  }
  return count;
}

/* Обработка обычного ввода и вставки: сырое значение поля + позиция курсора → маска + новый курсор */
export function maskPhoneInput(raw, caret) {
  // Набрали перед «+7 (» (курсор стоял в начале) — переносим набранное за префикс
  const prefixIndex = String(raw).indexOf(PREFIX);
  if (prefixIndex > 0) {
    const typed = String(raw).slice(0, prefixIndex);
    raw = PREFIX + typed + String(raw).slice(prefixIndex + PREFIX.length);
    caret = PREFIX.length + typed.length;
  }
  const parsed = extractPhoneDigits(raw);
  // Поле уже начинается с «+7 (», а человек по привычке набирает 8 или 7 — это код страны, а не цифра номера
  if (parsed.hasCountryCode && (parsed.digits === "7" || parsed.digits === "8")) {
    parsed.digits = "";
  }
  const value = parsed.digits.length === 0 && parsed.hasCountryCode ? PREFIX : formatPhone(parsed.digits);
  let digitsBeforeCaret = String(raw).slice(0, caret).replace(/\D/g, "").length;
  if (parsed.hasCountryCode) {
    digitsBeforeCaret--;
  }
  digitsBeforeCaret = Math.max(0, Math.min(digitsBeforeCaret, parsed.digits.length));
  return { value: value, caret: caretAfterDigit(value, digitsBeforeCaret) };
}

/* Вставка из буфера: целый номер (8…, 7…, +7…, 9…) заменяет поле, кусок цифр — вставляется в позицию */
export function maskPhonePaste(current, selectionStart, selectionEnd, pasted) {
  const pastedDigits = String(pasted).replace(/\D/g, "");
  if (pastedDigits.length >= NATIONAL_LENGTH) {
    const value = formatPhone(extractPhoneDigits(pasted).digits);
    return { value: value, caret: value.length };
  }
  const raw = String(current).slice(0, selectionStart) + pastedDigits + String(current).slice(selectionEnd);
  return maskPhoneInput(raw, selectionStart + pastedDigits.length);
}

/* Backspace: стирает ближайшую цифру слева от курсора, даже если прямо слева «) », «-» или пробел */
export function deleteDigitBefore(formatted, caret) {
  const digits = extractPhoneDigits(formatted).digits;
  const before = nationalDigitsBefore(formatted, caret);
  if (before === 0) {
    // Слева только «+7 (» — стирать нечего; если цифр нет совсем, очищаем поле
    return digits.length === 0 ? { value: "", caret: 0 } : { value: formatted, caret: PREFIX.length };
  }
  const nextDigits = digits.slice(0, before - 1) + digits.slice(before);
  const value = formatPhone(nextDigits);
  return { value: value, caret: caretAfterDigit(value, before - 1) };
}

/* Delete: стирает ближайшую цифру справа от курсора */
export function deleteDigitAfter(formatted, caret) {
  const digits = extractPhoneDigits(formatted).digits;
  const before = nationalDigitsBefore(formatted, caret);
  if (before >= digits.length) {
    return { value: formatted, caret: caret };
  }
  const nextDigits = digits.slice(0, before) + digits.slice(before + 1);
  const value = formatPhone(nextDigits);
  return { value: value, caret: caretAfterDigit(value, before) };
}

/* ---- Правила формы: функция возвращает текст ошибки или "" ---- */

export function validateName(value) {
  const name = String(value).trim();
  if (name.length === 0) {
    return "Введите имя";
  }
  if (!/^[A-Za-zА-Яа-яЁё\s-]+$/.test(name)) {
    return "Только буквы, пробел и дефис";
  }
  if (name.length < 2) {
    return "Имя — минимум 2 символа";
  }
  return "";
}

export function validatePhone(value) {
  const digits = extractPhoneDigits(value).digits;
  if (digits.length === 0) {
    return "Введите телефон";
  }
  if (digits.length !== NATIONAL_LENGTH) {
    return "Номер неполный — нужно 10 цифр после +7";
  }
  if (digits[0] !== "9") {
    return "Мобильный номер начинается с 9: +7 (9…)";
  }
  return "";
}

export function validateCar(value) {
  const car = String(value).trim();
  if (car.length === 0) {
    return "Укажите марку и модель";
  }
  if (car.length < 2) {
    return "Минимум 2 символа";
  }
  if (car.length > CAR_MAX_LENGTH) {
    return "Не длиннее " + CAR_MAX_LENGTH + " символов";
  }
  return "";
}

export function validateEstimate(itemsCount) {
  return itemsCount > 0 ? "" : "Смета пустая — выберите хотя бы одну услугу или зону";
}

/* Вся форма разом: { name, phone, car, estimate } — тексты ошибок */
export function validateForm(values, itemsCount) {
  return {
    name: validateName(values.name),
    phone: validatePhone(values.phone),
    car: validateCar(values.car),
    estimate: validateEstimate(itemsCount)
  };
}

export function isFormValid(errors) {
  return Object.values(errors).every(function (message) {
    return message === "";
  });
}
