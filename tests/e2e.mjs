// E2E многостраничного сайта в настоящем Chrome по протоколу DevTools (без Playwright и зависимостей, Node 22+).
// Проверяет путь клиента по 4 страницам, сохранение выбора (localStorage), перезагрузку, «Назад», две вкладки.
// Клики — настоящими событиями мыши, ввод и Backspace — событиями клавиатуры.
// Запуск: python -m http.server 8137  →  node tests/e2e.mjs [адрес]
// Переменные: CHROME_PATH — путь к Chrome/Edge, SHOTS_DIR — куда сохранить скриншоты.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_UNDER_TEST = process.argv[2] || "http://127.0.0.1:8137/";
const SHOTS_DIR = process.env.SHOTS_DIR || "";
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
let failed = 0;
function check(condition, message) {
  if (condition) {
    passed++;
    console.log("  ✔ " + message);
  } else {
    failed++;
    console.log("  ✖ " + message);
  }
}

/* ---- Браузер ---- */
const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chromePath) {
  console.error("Не найден Chrome — задай CHROME_PATH");
  process.exit(2);
}
const profile = mkdtempSync(join(tmpdir(), "sg-e2e-"));
const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolve, reject) => {
  let buffer = "";
  chrome.stderr.on("data", (chunk) => {
    buffer += chunk;
    const match = buffer.match(/ws:\/\/[^\s]+/);
    if (match) {
      resolve(match[0]);
    }
  });
  setTimeout(() => reject(new Error("Chrome не запустился")), 20000);
});

const socket = new WebSocket(wsUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve));
let messageId = 0;
const pending = new Map();
const events = [];
socket.addEventListener("message", (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data);
    pending.delete(data.id);
  } else if (data.method) {
    events.push(data);
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve) => {
    const id = ++messageId;
    pending.set(id, resolve);
    socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

/* Вкладка браузера: переходы между страницами — настоящие (клик по ссылке, reload, «Назад») */
async function openTab(width, height, mobile) {
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

  // Ждём загрузку новой страницы после действия, которое вызывает переход
  async function waitForLoad(action) {
    const start = events.length;
    await action();
    for (let i = 0; i < 300 && !events.slice(start).some((event) => event.sessionId === sessionId && event.method === "Page.loadEventFired"); i++) {
      await sleep(50);
    }
    await sleep(700);
  }

  const tab = {
    async goto(path) {
      await waitForLoad(() => call("Page.navigate", { url: new URL(path, URL_UNDER_TEST).href }));
    },
    async reload() {
      await waitForLoad(() => call("Page.reload", {}));
    },
    async back() {
      await waitForLoad(() => tab.eval("history.back();"));
    },
    async eval(expression) {
      const response = await call("Runtime.evaluate", { expression: "(async () => { " + expression + " })()", awaitPromise: true, returnByValue: true });
      if (response.result.exceptionDetails) {
        throw new Error(response.result.exceptionDetails.exception?.description || "ошибка в странице");
      }
      return response.result.result.value;
    },
    async box(selector, fx = 0.5, fy = 0.5) {
      return tab.eval("const el = document.querySelector(" + JSON.stringify(selector) + "); el.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); const r = el.getBoundingClientRect(); return { x: r.left + r.width * " + fx + ", y: r.top + r.height * " + fy + " };");
    },
    // fx, fy — точка клика в долях рамки элемента (по умолчанию центр)
    async click(selector, fx = 0.5, fy = 0.5) {
      const point = await tab.box(selector, fx, fy);
      await tab.clickAt(point.x, point.y);
    },
    async clickAndWait(selector) {
      const point = await tab.box(selector);
      await waitForLoad(() => tab.clickAt(point.x, point.y));
    },
    async clickAt(x, y) {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      }
      await sleep(80);
    },
    async hover(selector) {
      const point = await tab.box(selector);
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      await sleep(700);
    },
    async key(key, code, keyCode, text) {
      await call("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode, text });
      await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
      await sleep(30);
    },
    async type(text) {
      for (const char of text) {
        await call("Input.insertText", { text: char });
        await sleep(15);
      }
    },
    async shot(name) {
      if (!SHOTS_DIR) {
        return;
      }
      mkdirSync(SHOTS_DIR, { recursive: true });
      const { result } = await call("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS_DIR, name + ".png"), Buffer.from(result.data, "base64"));
    },
    jsErrors() {
      return events.filter((event) => event.sessionId === sessionId && (event.method === "Runtime.exceptionThrown" || (event.method === "Runtime.consoleAPICalled" && event.params.type === "error"))).length;
    },
    close: () => send("Target.closeTarget", { targetId })
  };
  return tab;
}

const TEXT = (selector) => "return (document.querySelector(" + JSON.stringify(selector) + ")?.textContent || '').replace(/\\s+/g, ' ').trim();";
const ESTIMATE_ITEMS = "return [...document.querySelectorAll('#estimateList li')].map(li => li.textContent.replace(/\\s+/g, ' ').trim());";
const PAGE = "return location.pathname.split('/').pop() || 'index.html';";
const nbsp = (text) => text.replace(/ /g, " ");
const text = async (tab, selector) => nbsp(await tab.eval(TEXT(selector)));

/* ================= Десктоп 1280: весь путь клиента по 4 страницам ================= */
console.log("Десктоп 1280×900 — путь по страницам");
const tab = await openTab(1280, 900, false);
await tab.goto("index.html");
await tab.eval("localStorage.clear();");
await tab.reload();

// Главная
check((await text(tab, "a.btn--glow[href='calculator.html']")).includes("Перейти к расчёту сметы"), "главная: кнопка «Перейти к расчёту сметы» → calculator.html");
await tab.shot("01-home");
await tab.clickAndWait("a.btn--glow[href='calculator.html']");
check((await tab.eval(PAGE)) === "calculator.html", "клик по кнопке открыл страницу конфигуратора");
check((await tab.eval("return document.querySelector('[data-step=calculator]').getAttribute('aria-current');")) === "step", "в шапке отмечен текущий шаг 01 (aria-current=step)");

// Конфигуратор: внедорожник + керамика
await tab.click("#classOptions .option:nth-child(3)");
await tab.click("#packageOptions .option:nth-child(1)");
await sleep(300);
check((await text(tab, ".step-bar [data-total]")) === "49 000 ₽", "внедорожник + керамика = 49 000 ₽ (нижняя плашка)");
check((await text(tab, ".header__total [data-total]")) === "49 000 ₽", "итог в шапке совпадает");
check((await text(tab, "#packageOptions .option:nth-child(1) .package-card__price")) === "49 000 ₽", "цена в карточке пересчитана под класс");
check((await text(tab, ".step-bar [data-count]")) === "1 позиция", "счётчик «1 позиция»");

// Микро-анимация наведения: scale(1.02) и неоновая тень
await tab.hover("#packageOptions .option:nth-child(3)");
const hover = await tab.eval("const s = getComputedStyle(document.querySelector('#packageOptions .option:nth-child(3) .option__card')); return { t: s.transform, shadow: s.boxShadow };");
const scale = hover.t.startsWith("matrix(") ? parseFloat(hover.t.slice(7)) : 1;
check(Math.abs(scale - 1.02) < 0.005 && hover.shadow.includes("196, 255, 58"), "наведение на карточку: scale(" + scale.toFixed(3) + ") и лаймовое свечение границы");
const wideOnHover = await tab.eval("return document.documentElement.scrollWidth > innerWidth;");
check(!wideOnHover, "увеличенная карточка не раздувает ширину страницы");
await tab.shot("02-calculator-hover");

// Далее → карта: состояние перенесено
await tab.clickAndWait(".step-bar a.btn--glow");
check((await tab.eval(PAGE)) === "map.html", "«Далее: Выбрать зоны на карте» открыла map.html");
check((await text(tab, ".header__total [data-total]")) === "49 000 ₽", "на карте итог 49 000 ₽ — выбор с прошлой страницы сохранён");
check((await text(tab, "#mapContext")).includes("Внедорожник ×1.4"), "панель карты знает класс машины с шага 1");

// Капот мышью, крыша клавиатурой
await tab.click("[data-zone=hood]");
await sleep(300);
check((await tab.eval("return document.querySelector('[data-zone=hood]').classList.contains('is-active') && document.querySelector('[data-zone=hood]').getAttribute('aria-pressed') === 'true';")), "клик по капоту — зона подсвечена, aria-pressed=true");
check((await text(tab, ".step-bar [data-total]")) === "82 600 ₽", "итог 49 000 + капот 33 600 = 82 600 ₽");
await tab.eval("document.querySelector('[data-zone=roof]').focus();");
await tab.key("Enter", "Enter", 13, "\r");
await sleep(200);
check((await tab.eval("return document.querySelector('[data-zone=roof]').classList.contains('is-active');")), "Enter на «Крыше» выбирает зону");
await tab.key(" ", "Space", 32, " ");
await sleep(200);
check(!(await tab.eval("return document.querySelector('[data-zone=roof]').classList.contains('is-active');")), "Space снимает зону");

// Клики по декору (стекло, колесо, зеркало) ничего не выбирают
const before = await text(tab, ".step-bar [data-total]");
await tab.click(".car__glass");
await tab.click(".car__decor rect");
await tab.click(".car__decor path:last-child");
await sleep(200);
check((await text(tab, ".step-bar [data-total]")) === before && (await tab.eval("return document.querySelectorAll('.zone.is-active').length;")) === 1, "клики по стеклу, колесу и зеркалу ничего не меняют");

// Перезагрузка — выбор на месте
await tab.reload();
check((await tab.eval("return document.querySelector('[data-zone=hood]').classList.contains('is-active');")) && (await text(tab, ".step-bar [data-total]")) === "82 600 ₽", "после перезагрузки страницы капот и итог на месте");

// Все зоны → подсказка экономии → полная оклейка без дублей
await tab.click("[data-zone=headlights]", 0.12, 0.5);
for (const zone of ["front-bumper", "roof", "doors-left", "doors-right", "trunk", "rear-bumper"]) {
  await tab.click("[data-zone=" + zone + "]");
}
await sleep(300);
check((await text(tab, "#zoneSaving")).includes("Полная оклейка выйдет на 7 000 ₽ дешевле"), "подсказка экономии: «Полная оклейка выйдет на 7 000 ₽ дешевле»");
await tab.click("#switchToFull");
await sleep(500);
const map = await tab.eval("const z = [...document.querySelectorAll('.zone')]; return z.every(e => e.classList.contains('is-included') && e.getAttribute('aria-disabled') === 'true');");
check(map, "полная оклейка → все 8 зон включены и заблокированы");
await tab.click("[data-zone=trunk]");
await sleep(200);
check((await text(tab, ".step-bar [data-total]")) === "259 000 ₽", "клик по зоне при полной оклейке ничего не меняет, итог 259 000 ₽");
await tab.eval("window.scrollTo(0, 0);");
await sleep(200);
await tab.shot("03-map-full-wrap");

// → смета: без дублей, в порядке прайса
await tab.clickAndWait(".step-bar a.btn--glow");
check((await tab.eval(PAGE)) === "checkout.html", "«Перейти к финальной смете» открыла checkout.html");
let items = (await tab.eval(ESTIMATE_ITEMS)).map(nbsp);
check(items.length === 2 && items[0].includes("Керамика кузова") && items[1].includes("Бронеплёнка — весь кузов"), "в смете 2 позиции в порядке прайса, точечных зон нет (" + items.length + ")");
await sleep(500);
check((await text(tab, "#estimateTotal")) === "259 000 ₽", "итог сметы 259 000 ₽");

// «Назад» в браузере (bfcache) — карта показывает актуальное состояние
await tab.back();
check((await tab.eval(PAGE)) === "map.html" && (await tab.eval("return document.querySelectorAll('.zone.is-included').length;")) === 8, "кнопка «Назад» → карта с актуальным состоянием");
await tab.goto("checkout.html");

// Пустая форма → ошибки
await tab.click("#orderForm button[type=submit]");
await sleep(200);
const form = await tab.eval("return { errors: [...document.querySelectorAll('.field__error')].filter(e => e.textContent).map(e => e.id), focus: document.activeElement.id };");
check(form.errors.length === 3 && form.focus === "fieldName", "пустая форма → 3 ошибки, фокус на имени (" + form.errors.join(", ") + ")");

// Маска телефона
await tab.click("#fieldPhone");
await tab.type("89991234567");
let phone = await tab.eval("return document.getElementById('fieldPhone').value;");
check(phone === "+7 (999) 123-45-67", "ввод с 8 → " + phone);
for (let i = 0; i < 3; i++) {
  await tab.key("Backspace", "Backspace", 8);
}
phone = await tab.eval("return document.getElementById('fieldPhone').value;");
check(phone === "+7 (999) 123-4", "3× Backspace проходит через «-»: " + phone);
await tab.eval("document.getElementById('fieldPhone').setSelectionRange(9, 9);");
await tab.key("Backspace", "Backspace", 8);
phone = await tab.eval("const el = document.getElementById('fieldPhone'); return el.value + '|' + el.selectionStart;");
check(phone === "+7 (991) 234|6", "Backspace сразу после «) » стирает цифру: " + phone.split("|")[0]);
await tab.eval("document.getElementById('fieldPhone').select();");
await tab.key("Backspace", "Backspace", 8);
await tab.type("+79997654321");
phone = await tab.eval("return document.getElementById('fieldPhone').value;");
check(phone === "+7 (999) 765-43-21", "ввод с +7 → " + phone);

// Валидная форма → модалка
await tab.click("#fieldName");
await tab.type("Иван");
await tab.click("#fieldCar");
await tab.type("Toyota Land Cruiser");
await tab.click("#orderForm button[type=submit]");
await sleep(500);
const modal = await tab.eval("const d = document.getElementById('successDialog'); return { modal: d.open && d.matches(':modal'), badge: document.querySelector('.modal__badge').textContent, title: document.getElementById('modalTitle').textContent, number: document.getElementById('modalNumber').textContent, car: document.getElementById('modalCar').textContent, total: document.getElementById('modalTotal').textContent };");
check(modal.modal && modal.badge === "Заявка принята", "валидная форма → модальное окно «Заявка принята» (showModal)");
check(modal.title === "Смета успешно сгенерирована и отправлена мастеру" && /^SG-\d{6}-\d{3}$/.test(modal.number), "заголовок и номер сметы " + modal.number);
check(modal.car === "Toyota Land Cruiser · Внедорожник" && nbsp(modal.total) === "259 000 ₽", "в модалке машина, класс и итог");
await tab.shot("04-checkout-modal");
await tab.key("Escape", "Escape", 27);
await sleep(300);
check(!(await tab.eval("return document.getElementById('successDialog').open;")), "Esc закрывает модалку");
await tab.eval("document.getElementById('successDialog').showModal();");
await sleep(400);
await tab.clickAt(8, 8);
await sleep(300);
check(!(await tab.eval("return document.getElementById('successDialog').open;")), "клик по фону закрывает модалку");

// «Начать новый расчёт» — чистый лист
await tab.eval("document.getElementById('successDialog').showModal();");
await sleep(400);
await tab.clickAndWait("#newEstimate");
check((await tab.eval(PAGE)) === "calculator.html" && (await text(tab, ".header__total [data-total]")) === "0 ₽", "«Начать новый расчёт» → конфигуратор с пустой сметой");
check((await tab.eval("return document.querySelectorAll('#packageOptions input:checked').length;")) === 0, "сохранённый выбор очищен");

// Пустая смета на странице заявки
await tab.goto("checkout.html");
check(!(await tab.eval("return document.getElementById('estimateEmpty').hidden;")), "пустая смета — понятный текст со ссылками на шаги");
await tab.click("#orderForm button[type=submit]");
await sleep(200);
check((await text(tab, "#errorEstimate")).includes("Смета пустая"), "отправка с пустой сметой — ошибка «Смета пустая»");

// Мусор в хранилище не ломает сайт
await tab.eval("localStorage.setItem('steel-gloss:state', '{битый json');");
await tab.goto("map.html");
check((await tab.eval("return document.querySelectorAll('.zone').length;")) === 8 && (await text(tab, ".header__total [data-total]")) === "0 ₽", "битый JSON в хранилище → чистое состояние, карта работает");
await tab.eval("localStorage.setItem('steel-gloss:state', JSON.stringify({ version: 1, state: { carClassId: 'bus', selectedPackages: ['ceramic', 'old-service'], selectedZones: ['hood', 'spoiler'] } }));");
await tab.reload();
check((await text(tab, ".step-bar [data-total]")) === "59 000 ₽", "неизвестные id отброшены: седан, керамика 35 000 + капот 24 000 = 59 000 ₽");

check(tab.jsErrors() === 0, "ошибок в консоли нет (" + tab.jsErrors() + ")");

/* ================= Две вкладки ================= */
console.log("Две вкладки");
const second = await openTab(1280, 900, false);
await second.goto("checkout.html");
await tab.goto("calculator.html");
await tab.click("#packageOptions .option:nth-child(3)");
await sleep(600);
check((await text(second, "#estimateList")).includes("Химчистка салона"), "выбор в одной вкладке появляется в смете другой (событие storage)");
check(second.jsErrors() === 0, "ошибок в консоли второй вкладки нет");
await second.close();
await tab.close();

/* ================= Телефон 375 ================= */
console.log("Телефон 375×812");
const phoneTab = await openTab(375, 812, true);
for (const path of ["index.html", "calculator.html", "map.html", "checkout.html"]) {
  await phoneTab.goto(path);
  const wide = await phoneTab.eval("return document.documentElement.scrollWidth > innerWidth;");
  check(!wide, path + ": нет горизонтального скролла");
}
await phoneTab.goto("map.html");
const bar = await phoneTab.eval("const b = document.querySelector('.step-bar'); const r = b.getBoundingClientRect(); const btn = b.querySelector('.btn--glow').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && btn.right <= innerWidth && btn.left >= 0;");
check(bar, "нижняя плашка шага на экране, кнопка «Далее» целиком видна");
await phoneTab.shot("05-mobile-map");
check(phoneTab.jsErrors() === 0, "ошибок в консоли нет (" + phoneTab.jsErrors() + ")");
await phoneTab.close();

console.log("\npass=" + passed + " fail=" + failed);
await send("Browser.close").catch(() => {});
await sleep(1000);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  // профиль может быть ещё занят Chrome — не критично
}
process.exit(failed ? 1 : 0);
