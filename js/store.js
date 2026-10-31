/* ==========================================================
   Единое состояние приложения + подписка.
   Модули не вызывают друг друга: меняют состояние здесь
   и перерисовываются, когда их уведомляют.
   ========================================================== */

import { DEFAULT_CAR_CLASS_ID, getCarClass, getPackage, getZone, hasFullWrap } from "./pricing.js";

const state = {
  carClassId: DEFAULT_CAR_CLASS_ID,
  selectedPackages: [],
  selectedZones: []
};

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
  notify();
}

export function togglePackage(packageId) {
  if (!getPackage(packageId)) {
    return;
  }
  toggleInList(state.selectedPackages, packageId);
  notify();
}

/* При полной оклейке зоны уже включены — точечный выбор заблокирован */
export function toggleZone(zoneId) {
  if (!getZone(zoneId) || hasFullWrap(state.selectedPackages)) {
    return;
  }
  toggleInList(state.selectedZones, zoneId);
  notify();
}

export function resetZones() {
  if (state.selectedZones.length === 0) {
    return;
  }
  state.selectedZones = [];
  notify();
}
