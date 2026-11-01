/* ==========================================================
   Сохранение состояния между страницами (localStorage).
   Хранилищу не доверяем: оно может быть недоступно (приватный
   режим, запрет cookies), переполнено или хранить мусор —
   старую версию, битый JSON, удалённые из прайса услуги.
   ========================================================== */

import { CAR_CLASSES, PACKAGES, ZONES, DEFAULT_CAR_CLASS_ID } from "./pricing.js";

export const STORAGE_KEY = "steel-gloss:state";
export const STORAGE_VERSION = 1;

export function createDefaultState() {
  return { carClassId: DEFAULT_CAR_CLASS_ID, selectedPackages: [], selectedZones: [] };
}

/* Оставляет только известные id, без повторов, в порядке прайса */
function pickKnown(list, catalog) {
  if (!Array.isArray(list)) {
    return [];
  }
  return catalog.filter(function (item) {
    return list.includes(item.id);
  }).map(function (item) {
    return item.id;
  });
}

/* Чистая функция: что угодно из хранилища → корректное состояние */
export function sanitizeState(raw) {
  const fallback = createDefaultState();
  if (!raw || typeof raw !== "object" || raw.version !== STORAGE_VERSION || !raw.state || typeof raw.state !== "object") {
    return fallback;
  }
  const state = raw.state;
  const knownClass = CAR_CLASSES.some(function (item) {
    return item.id === state.carClassId;
  });
  return {
    carClassId: knownClass ? state.carClassId : fallback.carClassId,
    selectedPackages: pickKnown(state.selectedPackages, PACKAGES),
    selectedZones: pickKnown(state.selectedZones, ZONES)
  };
}

export function parseStored(text) {
  if (typeof text !== "string" || text === "") {
    return createDefaultState();
  }
  try {
    return sanitizeState(JSON.parse(text));
  } catch (error) {
    return createDefaultState();
  }
}

export function serializeState(state) {
  return JSON.stringify({ version: STORAGE_VERSION, state: state });
}

/* Доступ к localStorage может бросить исключение уже при обращении к свойству.
   Проверяем чтением: пробная запись упала бы и при переполненной квоте
   (она общая на весь домен), хотя прочитать сохранённое можно */
function getStorage() {
  try {
    const storage = window.localStorage;
    storage.getItem(STORAGE_KEY);
    return storage;
  } catch (error) {
    return null;
  }
}

const storage = getStorage();

/* false — хранилище недоступно: выбор живёт только до перехода на другую страницу */
export function isPersistent() {
  return storage !== null;
}

export function loadState() {
  if (!storage) {
    return createDefaultState();
  }
  try {
    return parseStored(storage.getItem(STORAGE_KEY));
  } catch (error) {
    return createDefaultState();
  }
}

export function saveState(state) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, serializeState(state));
  } catch (error) {
    // Переполнено или запрещено — сайт продолжает работать без сохранения
  }
}

export function clearState() {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    // нечего делать
  }
}
