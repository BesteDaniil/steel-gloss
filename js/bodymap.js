/* ==========================================================
   Модуль 2 — карта кузова (SVG, вид сверху, перед сверху).
   Зоны кликаются мышью и с клавиатуры; при полной оклейке
   все зоны «включены» и заблокированы.
   ========================================================== */

import { ZONES, getZonePrice, getFullWrapSaving, hasFullWrap, formatRub, PACKAGES, getCarClass } from "./pricing.js";
import { subscribe, getState, toggleZone, resetZones, togglePackage } from "./store.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/* Контуры зон в координатах viewBox 0 0 240 480; фары — две фигуры в одной зоне */
const ZONE_SHAPES = {
  "front-bumper": "M60 26 Q120 14 180 26 Q198 32 201 50 L39 50 Q42 32 60 26 Z",
  "headlights": "M44 55 L80 55 L73 67 L45 65 Z M196 55 L160 55 L167 67 L195 65 Z",
  "hood": "M46 72 L194 72 L190 158 L50 158 Z",
  "roof": "M80 206 L160 206 Q166 206 166 212 L166 294 Q166 300 160 300 L80 300 Q74 300 74 294 L74 212 Q74 206 80 206 Z",
  "doors-left": "M38 166 L62 166 Q67 250 62 334 L38 334 Q34 250 38 166 Z",
  "doors-right": "M202 166 L178 166 Q173 250 178 334 L202 334 Q206 250 202 166 Z",
  "trunk": "M54 342 L186 342 L190 416 L50 416 Z",
  "rear-bumper": "M38 424 L202 424 Q200 448 182 456 Q120 466 58 456 Q40 448 38 424 Z"
};

const FULL_WRAP_ID = (PACKAGES.find(function (item) {
  return item.coversAllZones;
}) || {}).id;

export function initBodyMap() {
  const layer = document.getElementById("zoneLayer");
  const focusBox = document.getElementById("zoneFocus");
  const list = document.getElementById("zoneList");
  const note = document.getElementById("zoneNote");
  const savingBox = document.getElementById("zoneSaving");
  const resetButton = document.getElementById("resetZones");
  const switchButton = document.getElementById("switchToFull");
  const context = document.getElementById("mapContext");
  if (!layer || !focusBox || !list || !note || !savingBox || !resetButton) {
    return;
  }
  const focusName = focusBox.querySelector(".panel__name");
  const focusPrice = focusBox.querySelector(".panel__price");

  let current = getState();
  let shownZone = null;
  const shapes = new Map();

  function zoneLabel(zone, state) {
    if (hasFullWrap(state.selectedPackages)) {
      return zone.name + " — входит в полную оклейку";
    }
    return zone.name + " — " + formatRub(getZonePrice(zone.id, state.carClassId));
  }

  function showZone(zone) {
    shownZone = zone;
    focusName.textContent = zone.name;
    if (hasFullWrap(current.selectedPackages)) {
      focusPrice.textContent = "Входит в полную оклейку";
    } else {
      focusPrice.textContent = formatRub(getZonePrice(zone.id, current.carClassId)) + (current.selectedZones.includes(zone.id) ? " · выбрана" : "");
    }
  }

  function clearFocus() {
    shownZone = null;
    focusName.textContent = "Наведите на деталь";
    focusPrice.textContent = "—";
  }

  let order = 0;
  for (const zone of ZONES) {
    const shape = ZONE_SHAPES[zone.id];
    if (!shape) {
      continue;
    }
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", shape);
    path.setAttribute("class", "zone");
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.dataset.zone = zone.id;
    // Порядок проявления зон при загрузке страницы
    path.style.setProperty("--n", String(order));
    order++;
    path.addEventListener("click", function () {
      toggleZone(zone.id);
    });
    path.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleZone(zone.id);
      }
    });
    path.addEventListener("pointerenter", function () {
      showZone(zone);
    });
    path.addEventListener("focus", function () {
      showZone(zone);
    });
    path.addEventListener("pointerleave", function () {
      if (document.activeElement !== path) {
        clearFocus();
      }
    });
    path.addEventListener("blur", clearFocus);
    layer.append(path);
    shapes.set(zone.id, { path: path, zone: zone });
  }

  resetButton.addEventListener("click", function () {
    resetZones();
  });
  if (switchButton && FULL_WRAP_ID) {
    switchButton.addEventListener("click", function () {
      togglePackage(FULL_WRAP_ID);
    });
  }

  subscribe(function (state) {
    current = state;
    const fullWrap = hasFullWrap(state.selectedPackages);

    // Что выбрано на шаге 1 — цены зон считаются по этому классу
    if (context) {
      const carClass = getCarClass(state.carClassId);
      context.innerHTML = "";
      const label = document.createElement("span");
      label.textContent = "Класс машины: ";
      const value = document.createElement("b");
      value.textContent = carClass.name + " ×" + carClass.coefficient.toFixed(1);
      const link = document.createElement("a");
      link.href = "calculator.html";
      link.textContent = "изменить";
      context.append(label, value, document.createTextNode(" · "), link);
    }

    shapes.forEach(function (view, zoneId) {
      const selected = state.selectedZones.includes(zoneId);
      view.path.classList.toggle("is-active", selected && !fullWrap);
      view.path.classList.toggle("is-included", fullWrap);
      view.path.setAttribute("aria-pressed", String(fullWrap || selected));
      view.path.setAttribute("aria-disabled", String(fullWrap));
      view.path.setAttribute("aria-label", zoneLabel(view.zone, state));
    });

    list.textContent = "";
    if (fullWrap) {
      const item = document.createElement("li");
      item.innerHTML = "<span>Весь кузов</span><span>в пакете</span>";
      list.append(item);
    } else {
      for (const zone of ZONES) {
        if (state.selectedZones.includes(zone.id)) {
          const item = document.createElement("li");
          const name = document.createElement("span");
          const price = document.createElement("span");
          name.textContent = zone.name;
          price.textContent = formatRub(getZonePrice(zone.id, state.carClassId));
          item.append(name, price);
          list.append(item);
        }
      }
      if (list.children.length === 0) {
        const empty = document.createElement("li");
        empty.className = "panel__empty";
        empty.textContent = "Пока ни одной зоны";
        list.append(empty);
      }
    }

    note.hidden = !fullWrap;
    note.textContent = fullWrap ? "Выбрана полная оклейка: все зоны уже включены, отдельно их выбирать не нужно." : "";

    const saving = getFullWrapSaving(state);
    savingBox.hidden = saving === 0;
    if (saving > 0) {
      savingBox.querySelector(".saving__text").textContent = "Полная оклейка выйдет на " + formatRub(saving) + " дешевле";
    }

    resetButton.disabled = fullWrap || state.selectedZones.length === 0;
    if (shownZone) {
      showZone(shownZone);
    }
  });
}
