/* ==========================================================
   Модуль 3 — смета: позиции в порядке прайса, класс машины, итог.
   Итог «перебегает» к новому числу; липкая плашка внизу
   прячется, когда сама смета на экране.
   ========================================================== */

import { calculateEstimate, formatRub, roundPrice } from "./pricing.js";
import { subscribe } from "./store.js";

const COUNT_DURATION = 400;

/* Плавный пересчёт числа; промежуточные суммы тоже кратны 100 ₽; при reduced motion — сразу */
function createCounter(elements) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let shown = 0;
  let frame = 0;

  function paint(value) {
    for (const element of elements) {
      element.textContent = formatRub(value);
    }
  }

  return function animateTo(target) {
    cancelAnimationFrame(frame);
    if (reduceMotion.matches || shown === target) {
      shown = target;
      paint(target);
      return;
    }
    const from = shown;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / COUNT_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      shown = roundPrice(from + (target - from) * eased);
      paint(shown);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        shown = target;
        paint(target);
      }
    }
    frame = requestAnimationFrame(step);
  };
}

export function initEstimate() {
  const card = document.getElementById("estimateCard");
  const list = document.getElementById("estimateList");
  const empty = document.getElementById("estimateEmpty");
  const classLine = document.getElementById("estimateClass");
  const total = document.getElementById("estimateTotal");
  const bar = document.getElementById("totalBar");
  const barValue = document.getElementById("totalBarValue");
  const live = document.getElementById("estimateLive");
  if (!card || !list || !total || !empty || !classLine) {
    return;
  }

  const animateTotal = createCounter([total, barValue].filter(Boolean));
  let hasItems = false;
  let estimateOnScreen = false;

  function updateBar() {
    if (!bar) {
      return;
    }
    bar.classList.toggle("is-visible", hasItems && !estimateOnScreen);
  }

  if (bar) {
    bar.hidden = false;
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(function (entries) {
        estimateOnScreen = entries[0].isIntersecting;
        updateBar();
      }, { threshold: 0.15 });
      observer.observe(card);
    }
  }

  subscribe(function (state) {
    const estimate = calculateEstimate(state);
    classLine.textContent = "Класс: " + estimate.carClass.name + " ×" + estimate.carClass.coefficient.toFixed(1);

    list.textContent = "";
    for (const item of estimate.items) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      const price = document.createElement("b");
      name.textContent = item.name;
      price.textContent = formatRub(item.price);
      row.append(name, price);
      list.append(row);
    }
    hasItems = estimate.items.length > 0;
    empty.hidden = hasItems;
    list.hidden = !hasItems;
    animateTotal(estimate.total);
    // Скринридеру — только конечная сумма, один раз, а не каждый кадр анимации
    if (live) {
      live.textContent = hasItems ? "Итого по смете: " + formatRub(estimate.total) : "Смета пуста";
    }
    updateBar();
  });
}
