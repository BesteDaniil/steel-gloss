/* ==========================================================
   Единое состояние приложения + подписка + сохранение.
   Модули не вызывают друг друга: меняют состояние здесь
   и перерисовываются, когда их уведомляют.
   Состояние переживает переход между страницами (localStorage),
   синхронизируется между вкладками и при возврате кнопкой «Назад».
   ========================================================== */

import { getCarClass, getPackage, getZone, hasFullWrap } from "./pricing.js";
import { STORAGE_KEY, loadState, saveState, clearState, parseStored, createDefaultState, isPersistent } from "./persistence.js";

let state = loadState();

const listeners = new Set();

/* Наружу — только копия, чтобы состояние нельзя было поменять в обход действий */
export function getState() {
  return {
    carClassId: state.carClassId,
    selectedPackages: state.selectedPackages.slice(),
    selectedZones: state.selectedZones.slice()
  };
}

function notify() {
  const snapshot = getState();
  listeners.forEach(function (listener) {
    listener(snapshot);
  });
}

function commit() {
  saveState(state);
  notify();
}

/* Подписчик сразу получает текущее состояние; возвращается функция отписки */
export function subscribe(listener) {
  listeners.add(listener);
  listener(getState());
  return function () {
    listeners.delete(listener);
  };
}

function toggleInList(list, id) {
  const index = list.indexOf(id);
  if (index === -1) {
    list.push(id);
  } else {
    list.splice(index, 1);
  }
}

export function setCarClass(carClassId) {
  getCarClass(carClassId);
  if (state.carClassId === carClassId) {
    return;
  }
  state.carClassId = carClassId;
  commit();
}

export function togglePackage(packageId) {
  if (!getPackage(packageId)) {
    return;
  }
  toggleInList(state.selectedPackages, packageId);
  commit();
}

/* При полной оклейке зоны уже включены — точечный выбор заблокирован */
export function toggleZone(zoneId) {
  if (!getZone(zoneId) || hasFullWrap(state.selectedPackages)) {
    return;
  }
  toggleInList(state.selectedZones, zoneId);
  commit();
}

export function resetZones() {
  if (state.selectedZones.length === 0) {
    return;
  }
  state.selectedZones = [];
  commit();
}

/* Новый расчёт с нуля */
export function resetAll() {
  state = createDefaultState();
  clearState();
  notify();
}

/* Перечитать сохранённое и перерисовать, если оно отличается от текущего */
function syncFrom(nextState) {
  if (JSON.stringify(nextState) === JSON.stringify(state)) {
    return;
  }
  state = nextState;
  notify();
}

if (typeof window !== "undefined") {
  // Другая вкладка поменяла выбор
  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY || event.key === null) {
      syncFrom(parseStored(event.newValue));
    }
  });
  // Возврат кнопкой «Назад»: страница достаётся из кэша браузера (bfcache) со старым состоянием
  window.addEventListener("pageshow", function (event) {
    // Без хранилища страница из кэша сама держит верный выбор — перечитывать нечего
    if (event.persisted && isPersistent()) {
      syncFrom(loadState());
    }
  });
}
