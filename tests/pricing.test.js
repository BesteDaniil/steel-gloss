import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAR_CLASSES, PACKAGES, ZONES, roundPrice, getCarClass, getPackagePrice, getZonePrice,
  calculateEstimate, getFullWrapSaving, hasFullWrap, createEstimateNumber, formatRub
} from "../js/pricing.js";

function makeState(carClassId, selectedPackages, selectedZones) {
  return { carClassId: carClassId, selectedPackages: selectedPackages || [], selectedZones: selectedZones || [] };
}

test("коэффициенты классов: седан 1.0, кроссовер 1.2, внедорожник 1.4", function () {
  assert.equal(getCarClass("sedan").coefficient, 1.0);
  assert.equal(getCarClass("crossover").coefficient, 1.2);
  assert.equal(getCarClass("suv").coefficient, 1.4);
  assert.equal(CAR_CLASSES.length, 3);
});

test("неизвестный класс — ошибка, а не тихий NaN", function () {
  assert.throws(function () {
    getCarClass("bus");
  });
});

test("roundPrice округляет до 100 ₽", function () {
  assert.equal(roundPrice(49000), 49000);
  assert.equal(roundPrice(7249), 7200);
  assert.equal(roundPrice(7250), 7300);
  assert.equal(roundPrice(14399.99), 14400);
  assert.equal(roundPrice(210000.00000000003), 210000);
});

test("цены пакетов по каждому классу", function () {
  assert.equal(getPackagePrice("ceramic", "sedan"), 35000);
  assert.equal(getPackagePrice("ceramic", "crossover"), 42000);
  assert.equal(getPackagePrice("ceramic", "suv"), 49000);
  assert.equal(getPackagePrice("ppf-full", "suv"), 210000);
  assert.equal(getPackagePrice("dry-cleaning", "crossover"), 14400);
  assert.equal(getPackagePrice("interior", "suv"), 35000);
});

test("цены зон по каждому классу (с округлением)", function () {
  assert.equal(getZonePrice("hood", "sedan"), 24000);
  assert.equal(getZonePrice("headlights", "crossover"), 7200);
  assert.equal(getZonePrice("rear-bumper", "suv"), 21000);
  assert.equal(getZonePrice("doors-left", "crossover"), 33600);
});

test("каждая цена в прайсе кратна 100 ₽ для всех классов", function () {
  for (const carClass of CAR_CLASSES) {
    for (const item of PACKAGES) {
      assert.equal(getPackagePrice(item.id, carClass.id) % 100, 0);
    }
    for (const zone of ZONES) {
      assert.equal(getZonePrice(zone.id, carClass.id) % 100, 0);
    }
  }
});

test("внедорожник + керамика = 49 000 ₽", function () {
  const estimate = calculateEstimate(makeState("suv", ["ceramic"]));
  assert.equal(estimate.total, 49000);
  assert.equal(estimate.items.length, 1);
});

test("пустая смета — ноль позиций и итог 0", function () {
  const estimate = calculateEstimate(makeState("sedan"));
  assert.equal(estimate.items.length, 0);
  assert.equal(estimate.total, 0);
});

test("позиции идут в порядке прайса, а не в порядке кликов", function () {
  const estimate = calculateEstimate(makeState("sedan", ["interior", "ceramic"], ["rear-bumper", "hood", "front-bumper"]));
  assert.deepEqual(estimate.items.map(function (item) {
    return item.id;
  }), ["ceramic", "interior", "front-bumper", "hood", "rear-bumper"]);
});

test("зона в смете называется «Оклейка бронеплёнкой: …» и стоит по классу", function () {
  const estimate = calculateEstimate(makeState("crossover", [], ["hood"]));
  assert.equal(estimate.items[0].name, "Оклейка бронеплёнкой: капот");
  assert.equal(estimate.items[0].price, 28800);
  assert.equal(estimate.total, 28800);
});

test("полная оклейка: точечные зоны не дублируются в смете", function () {
  const estimate = calculateEstimate(makeState("sedan", ["ppf-full"], ["hood", "roof", "trunk"]));
  assert.equal(estimate.zonesIncluded, true);
  assert.equal(estimate.items.filter(function (item) {
    return item.kind === "zone";
  }).length, 0);
  assert.equal(estimate.total, 150000);
});

test("полная оклейка + керамика по классу внедорожник", function () {
  const estimate = calculateEstimate(makeState("suv", ["ppf-full", "ceramic"], ["hood"]));
  assert.equal(estimate.total, 210000 + 49000);
  assert.equal(hasFullWrap(["ppf-full"]), true);
  assert.equal(hasFullWrap(["ceramic"]), false);
});

test("подсказка экономии: все зоны (155 000) дороже полной оклейки (150 000) на 5 000", function () {
  const allZones = ZONES.map(function (zone) {
    return zone.id;
  });
  assert.equal(getFullWrapSaving(makeState("sedan", [], allZones)), 5000);
  assert.equal(getFullWrapSaving(makeState("suv", [], allZones)), 7000);
});

test("подсказки нет, если зоны дешевле полной оклейки или она уже выбрана", function () {
  assert.equal(getFullWrapSaving(makeState("sedan", [], ["hood", "roof"])), 0);
  assert.equal(getFullWrapSaving(makeState("sedan", [], [])), 0);
  const allZones = ZONES.map(function (zone) {
    return zone.id;
  });
  assert.equal(getFullWrapSaving(makeState("sedan", ["ppf-full"], allZones)), 0);
});

test("номер сметы SG-ГГММДД-123", function () {
  assert.equal(createEstimateNumber(new Date(2026, 10, 1), 0), "SG-261101-100");
  assert.equal(createEstimateNumber(new Date(2026, 0, 9), 0.999), "SG-260109-999");
  assert.match(createEstimateNumber(new Date(), Math.random()), /^SG-\d{6}-\d{3}$/);
});

test("formatRub — пробелы-разделители и знак рубля", function () {
  assert.equal(formatRub(49000), "49 000 ₽");
});

test("склонение «позиция»: 0, 1, 2, 5, 11, 12, 21, 22, 104, 111", async function () {
  const { formatPositions } = await import("../js/pricing.js");
  assert.equal(formatPositions(0), "0 позиций");
  assert.equal(formatPositions(1), "1 позиция");
  assert.equal(formatPositions(2), "2 позиции");
  assert.equal(formatPositions(5), "5 позиций");
  assert.equal(formatPositions(11), "11 позиций");
  assert.equal(formatPositions(12), "12 позиций");
  assert.equal(formatPositions(21), "21 позиция");
  assert.equal(formatPositions(22), "22 позиции");
  assert.equal(formatPositions(104), "104 позиции");
  assert.equal(formatPositions(111), "111 позиций");
});
