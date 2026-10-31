/* ==========================================================
   Модуль 1 — конфигуратор: класс машины (radio) и пакеты (checkbox).
   Разметка строится из прайса; цены в карточках — уже по классу.
   ========================================================== */

import { CAR_CLASSES, PACKAGES, ZONES, getPackagePrice, formatRub } from "./pricing.js";
import { subscribe, setCarClass, togglePackage } from "./store.js";

/* Силуэты сбоку — только оформление; для нового класса без силуэта берётся седан */
const CLASS_ICONS = {
  sedan: "M4 27h6a5 5 0 0 1 10 0h28a5 5 0 0 1 10 0h8v-6l-7-3-10-7H25l-9 7-10 2-2 4z",
  crossover: "M4 27h6a5 5 0 0 1 10 0h28a5 5 0 0 1 10 0h8v-8l-6-3-8-8H22l-8 8-8 1-2 4z",
  suv: "M3 28h7a5 5 0 0 1 10 0h28a5 5 0 0 1 10 0h9V16l-5-1-6-9H17l-5 9-7 1-2 5z"
};

const CHECK_ICON = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 12l5 5L20 6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\"/></svg>";

function createClassOption(carClass) {
  const label = document.createElement("label");
  label.className = "option";
  label.innerHTML =
    "<input class=\"option__input\" type=\"radio\" name=\"carClass\" />" +
    "<span class=\"option__card\">" +
      "<svg class=\"class-card__icon\" viewBox=\"0 0 72 34\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\" /></svg>" +
      "<span class=\"class-card__body\">" +
        "<span class=\"class-card__row\"><span class=\"class-card__name\"></span><span class=\"class-card__coef\"></span></span>" +
        "<span class=\"class-card__hint\"></span>" +
      "</span>" +
    "</span>";
  const input = label.querySelector("input");
  input.value = carClass.id;
  label.querySelector("path").setAttribute("d", CLASS_ICONS[carClass.id] || CLASS_ICONS.sedan);
  label.querySelector(".class-card__name").textContent = carClass.name;
  label.querySelector(".class-card__coef").textContent = "×" + carClass.coefficient.toFixed(1);
  label.querySelector(".class-card__hint").textContent = carClass.hint;
  input.addEventListener("change", function () {
    if (input.checked) {
      setCarClass(carClass.id);
    }
  });
  return label;
}

function createPackageOption(item) {
  const label = document.createElement("label");
  label.className = "option";
  label.innerHTML =
    "<input class=\"option__input\" type=\"checkbox\" name=\"packages\" />" +
    "<span class=\"option__card package-card\">" +
      "<span class=\"package-card__top\"><span class=\"package-card__name\"></span><span class=\"package-card__check\">" + CHECK_ICON + "</span></span>" +
      "<span class=\"package-card__desc\"></span>" +
      "<span class=\"package-card__price\"></span>" +
    "</span>";
  const input = label.querySelector("input");
  input.value = item.id;
  label.querySelector(".package-card__name").textContent = item.name;
  label.querySelector(".package-card__desc").textContent = item.description;
  if (item.coversAllZones) {
    const note = document.createElement("span");
    note.className = "package-card__note";
    note.textContent = "Включает все " + ZONES.length + " зон карты кузова";
    label.querySelector(".package-card__desc").after(note);
  }
  input.addEventListener("change", function () {
    togglePackage(item.id);
  });
  return label;
}

export function initConfigurator() {
  const classContainer = document.getElementById("classOptions");
  const packageContainer = document.getElementById("packageOptions");
  if (!classContainer || !packageContainer) {
    return;
  }

  const classInputs = new Map();
  for (const carClass of CAR_CLASSES) {
    const option = createClassOption(carClass);
    classInputs.set(carClass.id, option.querySelector("input"));
    classContainer.append(option);
  }

  const packageViews = new Map();
  for (const item of PACKAGES) {
    const option = createPackageOption(item);
    packageViews.set(item.id, {
      input: option.querySelector("input"),
      price: option.querySelector(".package-card__price")
    });
    packageContainer.append(option);
  }

  subscribe(function (state) {
    classInputs.forEach(function (input, carClassId) {
      input.checked = carClassId === state.carClassId;
    });
    packageViews.forEach(function (view, packageId) {
      view.input.checked = state.selectedPackages.includes(packageId);
      view.price.textContent = formatRub(getPackagePrice(packageId, state.carClassId));
    });
  });
}
