/* ==========================================================
   Навигация по шагам расчёта — общая для всех страниц:
   отметки шагов в шапке, итог сметы в шапке и в нижней плашке,
   предупреждение, если браузер не даёт сохранять выбор.
   Текущая страница — <body data-page="…">.
   ========================================================== */

import { calculateEstimate, formatRub, formatPositions } from "./pricing.js";
import { subscribe } from "./store.js";
import { isPersistent } from "./persistence.js";

/* Порядок шагов — порядок ссылок [data-step] в шапке. Текущий шаг отмечен и в HTML
   (работает без JS); здесь — дополнительно пройденные шаги */
function markSteps(pageId) {
  const links = Array.from(document.querySelectorAll("[data-step]"));
  const currentIndex = links.findIndex(function (link) {
    return link.getAttribute("data-step") === pageId;
  });
  links.forEach(function (link, index) {
    const isCurrent = index === currentIndex;
    link.classList.toggle("is-current", isCurrent);
    link.classList.toggle("is-done", currentIndex !== -1 && index < currentIndex);
    if (isCurrent) {
      link.setAttribute("aria-current", "step");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

export function initNav() {
  markSteps(document.body.getAttribute("data-page"));

  const totals = document.querySelectorAll("[data-total]");
  const counts = document.querySelectorAll("[data-count]");
  subscribe(function (state) {
    const estimate = calculateEstimate(state);
    totals.forEach(function (element) {
      element.textContent = formatRub(estimate.total);
    });
    counts.forEach(function (element) {
      element.textContent = formatPositions(estimate.items.length);
    });
  });

  const warning = document.querySelector("[data-storage-warning]");
  if (warning) {
    warning.hidden = isPersistent();
  }
}
