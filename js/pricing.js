/* ==========================================================
   Прайс и расчёт сметы. Только данные и чистые функции — без DOM.
   Новая услуга или зона = одна строка в списках ниже.
   ========================================================== */

export const CAR_CLASSES = [
  { id: "sedan", name: "Седан", coefficient: 1.0, hint: "Седан, хэтчбек, универсал" },
  { id: "crossover", name: "Кроссовер", coefficient: 1.2, hint: "Компактные и средние SUV" },
  { id: "suv", name: "Внедорожник", coefficient: 1.4, hint: "Полноразмерные SUV и пикапы" }
];

/* Цены — база для седана, в рублях */
export const PACKAGES = [
  { id: "ceramic", name: "Керамика кузова", base: 35000, description: "Двухслойное керамическое покрытие: глубокий блеск и защита ЛКП до 3 лет." },
  { id: "ppf-full", name: "Бронеплёнка — весь кузов", base: 150000, description: "Полиуретановая плёнка на все окрашенные элементы. Защита от сколов и песка.", coversAllZones: true },
  { id: "dry-cleaning", name: "Химчистка салона", base: 12000, description: "Сиденья, потолок, ковры и багажник — глубокая чистка паром и экстракцией." },
  { id: "interior", name: "Детейлинг салона", base: 25000, description: "Химчистка плюс уход за кожей, пластиком и защитная пропитка." }
];

export const ZONES = [
  { id: "front-bumper", name: "Передний бампер", base: 18000 },
  { id: "headlights", name: "Фары", base: 6000 },
  { id: "hood", name: "Капот", base: 24000 },
  { id: "roof", name: "Крыша", base: 20000 },
  { id: "doors-left", name: "Левые двери", base: 28000 },
  { id: "doors-right", name: "Правые двери", base: 28000 },
  { id: "trunk", name: "Багажник", base: 16000 },
  { id: "rear-bumper", name: "Задний бампер", base: 15000 }
];

export const ZONE_ITEM_PREFIX = "Оклейка бронеплёнкой: ";
export const DEFAULT_CAR_CLASS_ID = CAR_CLASSES[0].id;

/* Округление до 100 ₽ — единственное место, где округляем цены */
export function roundPrice(value) {
  return Math.round(value / 100) * 100;
}

export function getCarClass(carClassId) {
  const carClass = CAR_CLASSES.find(function (item) {
    return item.id === carClassId;
  });
  if (!carClass) {
    throw new Error("Неизвестный класс машины: " + carClassId);
  }
  return carClass;
}

export function getPackage(packageId) {
  return PACKAGES.find(function (item) {
    return item.id === packageId;
  });
}

export function getZone(zoneId) {
  return ZONES.find(function (item) {
    return item.id === zoneId;
  });
}

export function getClassPrice(base, carClassId) {
  return roundPrice(base * getCarClass(carClassId).coefficient);
}

export function getPackagePrice(packageId, carClassId) {
  return getClassPrice(getPackage(packageId).base, carClassId);
}

export function getZonePrice(zoneId, carClassId) {
  return getClassPrice(getZone(zoneId).base, carClassId);
}

/* Выбран ли пакет, который закрывает весь кузов (тогда точечные зоны не считаются) */
export function hasFullWrap(selectedPackages) {
  return PACKAGES.some(function (item) {
    return item.coversAllZones && selectedPackages.includes(item.id);
  });
}

function getFullWrapPackage() {
  return PACKAGES.find(function (item) {
    return item.coversAllZones;
  });
}

/* Сколько сэкономит полная оклейка вместо выбранных зон; 0 — если не выгоднее или она уже выбрана */
export function getFullWrapSaving(state) {
  const fullWrap = getFullWrapPackage();
  if (!fullWrap || hasFullWrap(state.selectedPackages)) {
    return 0;
  }
  let zonesTotal = 0;
  for (const zone of ZONES) {
    if (state.selectedZones.includes(zone.id)) {
      zonesTotal += getZonePrice(zone.id, state.carClassId);
    }
  }
  const saving = zonesTotal - getPackagePrice(fullWrap.id, state.carClassId);
  return saving > 0 ? saving : 0;
}

/* Смета: позиции в порядке прайса (не по порядку кликов), без дублей зон при полной оклейке */
export function calculateEstimate(state) {
  const carClass = getCarClass(state.carClassId);
  const items = [];
  for (const item of PACKAGES) {
    if (state.selectedPackages.includes(item.id)) {
      items.push({ id: item.id, kind: "package", name: item.name, price: getPackagePrice(item.id, carClass.id) });
    }
  }
  const zonesIncluded = hasFullWrap(state.selectedPackages);
  if (!zonesIncluded) {
    for (const zone of ZONES) {
      if (state.selectedZones.includes(zone.id)) {
        items.push({ id: zone.id, kind: "zone", name: ZONE_ITEM_PREFIX + zone.name.toLowerCase(), price: getZonePrice(zone.id, carClass.id) });
      }
    }
  }
  const total = items.reduce(function (sum, item) {
    return sum + item.price;
  }, 0);
  return {
    carClass: carClass,
    items: items,
    total: total,
    zonesIncluded: zonesIncluded,
    fullWrapSaving: getFullWrapSaving(state)
  };
}

export function formatRub(value) {
  return value.toLocaleString("ru-RU").replace(/\s/g, " ") + " ₽";
}

/* Номер сметы: SG-ГГММДД-123 */
export function createEstimateNumber(date, randomValue) {
  const pad = function (number) {
    return String(number).padStart(2, "0");
  };
  const datePart = String(date.getFullYear()).slice(-2) + pad(date.getMonth() + 1) + pad(date.getDate());
  const suffix = 100 + Math.floor(randomValue * 900);
  return "SG-" + datePart + "-" + suffix;
}

/* «1 позиция», «3 позиции», «5 позиций», «11 позиций», «21 позиция» */
export function formatPositions(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  let word = "позиций";
  if (lastTwo < 11 || lastTwo > 14) {
    if (last === 1) {
      word = "позиция";
    } else if (last >= 2 && last <= 4) {
      word = "позиции";
    }
  }
  return count + " " + word;
}
