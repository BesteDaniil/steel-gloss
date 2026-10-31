import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractPhoneDigits, formatPhone, maskPhoneInput, maskPhonePaste, deleteDigitBefore, deleteDigitAfter,
  validateName, validatePhone, validateCar, validateEstimate, validateForm, isFormValid
} from "../js/validation.js";

/* Набор с клавиатуры по одному символу, курсор всегда в конце */
function typeChars(text) {
  let value = "";
  for (const char of text) {
    const raw = value + char;
    value = maskPhoneInput(raw, raw.length).value;
  }
  return value;
}

test("маска: набор с 8, 7, +7 и сразу с 9 даёт один и тот же номер", function () {
  const expected = "+7 (999) 123-45-67";
  assert.equal(typeChars("89991234567"), expected);
  assert.equal(typeChars("79991234567"), expected);
  assert.equal(typeChars("+79991234567"), expected);
  assert.equal(typeChars("9991234567"), expected);
});

test("маска: разделители появляются только перед следующей цифрой", function () {
  assert.equal(formatPhone(""), "");
  assert.equal(formatPhone("9"), "+7 (9");
  assert.equal(formatPhone("999"), "+7 (999");
  assert.equal(formatPhone("9991"), "+7 (999) 1");
  assert.equal(formatPhone("999123"), "+7 (999) 123");
  assert.equal(formatPhone("9991234"), "+7 (999) 123-4");
  assert.equal(formatPhone("999123456"), "+7 (999) 123-45-6");
});

test("маска: лишние цифры отбрасываются, буквы игнорируются", function () {
  assert.equal(typeChars("899912345678888"), "+7 (999) 123-45-67");
  assert.equal(typeChars("9a9b9"), "+7 (999");
});

test("маска: поле с готовым «+7 (» — набор с 8, 7 и +7 не превращает код страны в цифру номера", function () {
  const expected = "+7 (999) 123-45-67";
  for (const start of ["8", "7", "+7"]) {
    let value = "+7 (";
    for (const char of start + "9991234567") {
      const raw = value + char;
      value = maskPhoneInput(raw, raw.length).value;
    }
    assert.equal(value, expected, "набор с " + start);
  }
});

test("маска: вырезали «+7 (» выделением — номер на 8 не теряет свою восьмёрку", function () {
  // было «+7 (800) 555-12-34», выделили и удалили «+7 (»
  assert.equal(maskPhoneInput("800) 555-12-34", 0).value, "+7 (800) 555-12-34");
  // удалили только «+»
  assert.equal(maskPhoneInput("7 (999) 123", 0).value, "+7 (999) 123");
});

test("маска: цифра, набранная перед «+7 (», уходит за префикс", function () {
  const result = maskPhoneInput("5+7 (999) 12", 1);
  assert.equal(result.value, "+7 (599) 912");
  assert.equal(result.caret, 5);
});

test("маска: первая 8 сразу превращается в «+7 (»", function () {
  assert.equal(maskPhoneInput("8", 1).value, "+7 (");
  assert.equal(maskPhoneInput("+", 1).value, "");
});

test("вставка из буфера: 8…, +7…, 7…, 10 цифр и с пробелами/скобками", function () {
  const expected = "+7 (999) 123-45-67";
  assert.equal(maskPhonePaste("", 0, 0, "89991234567").value, expected);
  assert.equal(maskPhonePaste("", 0, 0, "+7 999 123-45-67").value, expected);
  assert.equal(maskPhonePaste("", 0, 0, "7 (999) 1234567").value, expected);
  assert.equal(maskPhonePaste("", 0, 0, "9991234567").value, expected);
  assert.equal(maskPhonePaste("+7 (", 4, 4, "8 999 123 45 67").value, expected);
  assert.equal(maskPhonePaste("+7 (", 4, 4, "8 999 123 45 67").caret, expected.length);
});

test("вставка куска цифр — в позицию курсора", function () {
  const result = maskPhonePaste("+7 (999", 7, 7, "123");
  assert.equal(result.value, "+7 (999) 123");
  assert.equal(result.caret, 12);
});

test("Backspace через «) » стирает цифру, а не застревает", function () {
  // курсор сразу после «) » — слева скобка и пробел
  const result = deleteDigitBefore("+7 (999) 1", 9);
  assert.equal(result.value, "+7 (991");
  assert.equal(result.caret, 6);
  assert.equal(extractPhoneDigits(result.value).digits, "991");
});

test("Backspace по полному номеру с конца доходит до пустого поля без застреваний", function () {
  let state = { value: "+7 (999) 123-45-67", caret: 18 };
  const seen = [];
  for (let step = 0; step < 12; step++) {
    state = deleteDigitBefore(state.value, state.caret);
    seen.push(state.value);
  }
  assert.deepEqual(seen.slice(0, 4), ["+7 (999) 123-45-6", "+7 (999) 123-45", "+7 (999) 123-4", "+7 (999) 123"]);
  assert.equal(seen[6], "+7 (999");
  assert.equal(seen[9], "");
  assert.equal(seen[11], "");
});

test("Backspace с курсором сразу после дефиса стирает цифру перед ним", function () {
  // «+7 (999) 123-|45-67» — слева дефис
  const result = deleteDigitBefore("+7 (999) 123-45-67", 13);
  assert.equal(extractPhoneDigits(result.value).digits, "999124567");
  assert.equal(result.value, "+7 (999) 124-56-7");
  assert.equal(result.caret, 11);
});

test("Backspace в середине номера ставит курсор на место стёртой цифры", function () {
  // «+7 (99|9) 123-45-67»
  const result = deleteDigitBefore("+7 (999) 123-45-67", 6);
  assert.equal(result.value, "+7 (991) 234-56-7");
  assert.equal(result.caret, 5);
});

test("Backspace, когда слева только «+7 (»: пустое поле очищается, иначе курсор не уходит в префикс", function () {
  assert.deepEqual(deleteDigitBefore("+7 (", 4), { value: "", caret: 0 });
  assert.deepEqual(deleteDigitBefore("+7 (999", 4), { value: "+7 (999", caret: 4 });
});

test("Delete перед «) » стирает цифру справа", function () {
  const result = deleteDigitAfter("+7 (999) 123", 7);
  assert.equal(result.value, "+7 (999) 23");
  assert.equal(result.caret, 7);
});

test("имя: обязательно, от 2 символов, только буквы/пробел/дефис", function () {
  assert.equal(validateName(""), "Введите имя");
  assert.equal(validateName("   "), "Введите имя");
  assert.equal(validateName("Я"), "Имя — минимум 2 символа");
  assert.equal(validateName("Иван1"), "Только буквы, пробел и дефис");
  assert.equal(validateName("Иван!"), "Только буквы, пробел и дефис");
  assert.equal(validateName("Анна-Мария"), "");
  assert.equal(validateName("Пётр Ильич"), "");
  assert.equal(validateName("John"), "");
});

test("телефон: ровно 10 цифр после +7 и начинается с 9", function () {
  assert.equal(validatePhone(""), "Введите телефон");
  assert.equal(validatePhone("+7 ("), "Введите телефон");
  assert.equal(validatePhone("+7 (999) 123-45"), "Номер неполный — нужно 10 цифр после +7");
  assert.equal(validatePhone("+7 (499) 123-45-67"), "Мобильный номер начинается с 9: +7 (9…)");
  assert.equal(validatePhone("+7 (999) 123-45-67"), "");
});

test("марка и модель: обязательно, от 2 символов", function () {
  assert.equal(validateCar(""), "Укажите марку и модель");
  assert.equal(validateCar("X"), "Минимум 2 символа");
  assert.equal(validateCar("BMW X5"), "");
});

test("смета не должна быть пустой", function () {
  assert.notEqual(validateEstimate(0), "");
  assert.equal(validateEstimate(2), "");
});

test("validateForm и isFormValid собирают все правила", function () {
  const bad = validateForm({ name: "", phone: "", car: "" }, 0);
  assert.equal(isFormValid(bad), false);
  assert.equal(Object.values(bad).filter(Boolean).length, 4);
  const good = validateForm({ name: "Иван", phone: "+7 (999) 123-45-67", car: "Toyota Camry" }, 1);
  assert.equal(isFormValid(good), true);
});
