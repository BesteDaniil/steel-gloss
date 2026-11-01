import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeState, parseStored, serializeState, createDefaultState, STORAGE_VERSION } from "../js/persistence.js";

const wrap = function (state) {
  return { version: STORAGE_VERSION, state: state };
};

test("сохранённое состояние читается обратно без потерь", function () {
  const state = { carClassId: "suv", selectedPackages: ["ceramic", "interior"], selectedZones: ["hood", "roof"] };
  assert.deepEqual(parseStored(serializeState(state)), state);
});

test("пустое хранилище, битый JSON и чужие данные → чистое состояние", function () {
  const empty = createDefaultState();
  assert.deepEqual(parseStored(null), empty);
  assert.deepEqual(parseStored(""), empty);
  assert.deepEqual(parseStored("{не json"), empty);
  assert.deepEqual(parseStored("42"), empty);
  assert.deepEqual(parseStored("null"), empty);
  assert.deepEqual(parseStored("[]"), empty);
});

test("другая версия формата не читается (после обновления сайта)", function () {
  assert.deepEqual(sanitizeState({ version: 999, state: { carClassId: "suv", selectedPackages: ["ceramic"], selectedZones: [] } }), createDefaultState());
  assert.deepEqual(sanitizeState({ carClassId: "suv" }), createDefaultState());
});

test("неизвестный класс машины → седан, остальное сохраняется", function () {
  const result = sanitizeState(wrap({ carClassId: "bus", selectedPackages: ["ceramic"], selectedZones: ["hood"] }));
  assert.equal(result.carClassId, "sedan");
  assert.deepEqual(result.selectedPackages, ["ceramic"]);
  assert.deepEqual(result.selectedZones, ["hood"]);
});

test("удалённые из прайса услуги и зоны выбрасываются", function () {
  const result = sanitizeState(wrap({ carClassId: "crossover", selectedPackages: ["ceramic", "polishing-2019"], selectedZones: ["hood", "spoiler"] }));
  assert.deepEqual(result.selectedPackages, ["ceramic"]);
  assert.deepEqual(result.selectedZones, ["hood"]);
});

test("повторы убираются, порядок — как в прайсе", function () {
  const result = sanitizeState(wrap({ carClassId: "sedan", selectedPackages: ["interior", "ceramic", "interior"], selectedZones: ["trunk", "hood", "hood"] }));
  assert.deepEqual(result.selectedPackages, ["ceramic", "interior"]);
  assert.deepEqual(result.selectedZones, ["hood", "trunk"]);
});

test("не-массивы и не-строки вместо списков → пустые списки", function () {
  const result = sanitizeState(wrap({ carClassId: "suv", selectedPackages: "ceramic", selectedZones: { hood: true } }));
  assert.deepEqual(result, { carClassId: "suv", selectedPackages: [], selectedZones: [] });
  assert.deepEqual(sanitizeState(wrap({ carClassId: "suv", selectedPackages: [null, 5, {}], selectedZones: [] })).selectedPackages, []);
});

test("полная оклейка и зоны сохраняются вместе — дубли отсекает расчёт, а не хранилище", function () {
  const result = sanitizeState(wrap({ carClassId: "sedan", selectedPackages: ["ppf-full"], selectedZones: ["hood"] }));
  assert.deepEqual(result.selectedPackages, ["ppf-full"]);
  assert.deepEqual(result.selectedZones, ["hood"]);
});
