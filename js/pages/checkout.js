/* Шаг 3 — смета и заявка. Маска подключается до формы:
   её blur убирает пустое «+7 (» раньше, чем форма проверит поле */
import { initNav } from "../nav.js";
import { initEstimate } from "../estimate.js";
import { attachPhoneMask } from "../phone-mask.js";
import { initForm } from "../form.js";

initNav();
initEstimate();
attachPhoneMask(document.getElementById("fieldPhone"));
initForm();
