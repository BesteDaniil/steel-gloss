// E2E в настоящем Chrome по протоколу DevTools (без Playwright и зависимостей, Node 22+).
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

async function openPage(width, height, mobile) {
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  const start = events.length;
  await call("Page.navigate", { url: URL_UNDER_TEST + "?e2e=" + Date.now() });
  for (let i = 0; i < 300 && !events.slice(start).some((event) => event.sessionId === sessionId && event.method === "Page.loadEventFired"); i++) {
    await sleep(100);
  }
  await sleep(500);

  const page = {
    async eval(expression) {
      const response = await call("Runtime.evaluate", { expression: "(async () => { " + expression + " })()", awaitPromise: true, returnByValue: true });
      if (response.result.exceptionDetails) {
        throw new Error(response.result.exceptionDetails.exception?.description || "ошибка в странице");
      }
      return response.result.result.value;
    },
    // fx, fy — точка клика в долях рамки элемента (по умолчанию центр)
    async click(selector, fx = 0.5, fy = 0.5) {
      const box = await page.eval("const el = document.querySelector(" + JSON.stringify(selector) + "); el.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); const r = el.getBoundingClientRect(); return { x: r.left + r.width * " + fx + ", y: r.top + r.height * " + fy + " };");
      await page.clickAt(box.x, box.y);
    },
    async clickAt(x, y) {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      }
      await sleep(80);
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
  return page;
}

const TEXT = (selector) => "return (document.querySelector(" + JSON.stringify(selector) + ")?.textContent || '').replace(/\\s+/g, ' ').trim();";
const ESTIMATE_ITEMS = "return [...document.querySelectorAll('#estimateList li')].map(li => li.textContent.replace(/\\s+/g, ' ').trim());";
const nbsp = (text) => text.replace(/\u00a0/g, " ");

/* ================= Десктоп 1280 ================= */
console.log("Десктоп 1280×900");
const page = await openPage(1280, 900, false);

// Пустая форма и пустая смета
await page.click("#orderForm button[type=submit]");
await sleep(150);
let form = await page.eval("return { errors: [...document.querySelectorAll('.field__error')].filter(e => e.textContent).map(e => e.id), invalid: [...document.querySelectorAll('[aria-invalid=true]')].map(e => e.id), focus: document.activeElement.id, described: document.getElementById('fieldName').getAttribute('aria-describedby') };");
check(form.errors.length === 4, "пустая форма → 4 ошибки: имя, телефон, марка, пустая смета (" + form.errors.join(", ") + ")");
check(form.invalid.length === 3 && form.focus === "fieldName", "aria-invalid на 3 полях, фокус на первом невалидном (" + form.focus + ")");
check(form.described === "errorName", "ошибка связана с полем через aria-describedby");
await page.shot("01-empty-form-errors");

// Внедорожник + керамика = 49 000 ₽
await page.click("#classOptions .option:nth-child(3)");
await page.click("#packageOptions .option:nth-child(1)");
await sleep(600);
const total = nbsp(await page.eval(TEXT("#estimateTotal")));
const ceramicCard = nbsp(await page.eval(TEXT("#packageOptions .option:nth-child(1) .package-card__price")));
check(total === "49 000 ₽", "внедорожник + керамика = 49 000 ₽ (итог: " + total + ")");
check(ceramicCard === "49 000 ₽", "цена в карточке пересчитана под класс (" + ceramicCard + ")");
check((await page.eval(TEXT("#errorEstimate"))) === "", "ошибка «смета пустая» исчезла сама, как только появилась позиция");
const radios = await page.eval("return [...document.querySelectorAll('input[name=carClass]')].map(i => i.type + ':' + i.checked).join(',');");
check(radios === "radio:false,radio:false,radio:true", "класс — настоящие radio (" + radios + ")");

// Клик по капоту → позиция в смете
await page.click("[data-zone=hood]");
await sleep(500);
let items = (await page.eval(ESTIMATE_ITEMS)).map(nbsp);
check(items.some((item) => item.includes("Оклейка бронеплёнкой: капот") && item.includes("33 600 ₽")), "клик по капоту → «Оклейка бронеплёнкой: капот — 33 600 ₽» (×1.4)");
check((await page.eval("return document.querySelector('[data-zone=hood]').getAttribute('aria-pressed');")) === "true", "капот: aria-pressed=true");

// Клавиатура: Tab-фокус на крыше, Enter выбирает, Space снимает
await page.eval("document.querySelector('[data-zone=roof]').focus();");
await page.key("Enter", "Enter", 13, "\r");
await sleep(200);
items = (await page.eval(ESTIMATE_ITEMS)).map(nbsp);
check(items.some((item) => item.includes("крыша")), "Enter на зоне «Крыша» добавляет её в смету");
const panel = nbsp(await page.eval(TEXT("#zoneFocus")));
check(panel.includes("Крыша") && panel.includes("28 000 ₽"), "панель при фокусе показывает название и цену зоны (" + panel + ")");
await page.key(" ", "Space", 32, " ");
await sleep(200);
items = (await page.eval(ESTIMATE_ITEMS)).map(nbsp);
check(!items.some((item) => item.includes("крыша")), "Space снимает зону повторно");
const tabbable = await page.eval("return [...document.querySelectorAll('.zone')].every(z => z.getAttribute('tabindex') === '0' && z.getAttribute('role') === 'button' && z.getAttribute('aria-label'));");
check(tabbable, "все зоны: tabindex=0, role=button, aria-label");

// Порядок позиций — как в прайсе, а не по кликам: передний бампер кликнут последним, но идёт раньше капота
await page.click("[data-zone=front-bumper]");
await sleep(300);
items = (await page.eval(ESTIMATE_ITEMS)).map(nbsp);
check(items.findIndex((item) => item.includes("передний бампер")) < items.findIndex((item) => item.includes("капот")), "порядок сметы — как в прайсе, не по порядку кликов");

// Полная оклейка: зоны включены и заблокированы, без дублей
await page.click("#packageOptions .option:nth-child(2)");
await sleep(600);
let map = await page.eval("const z = [...document.querySelectorAll('.zone')]; return { included: z.every(e => e.classList.contains('is-included') && e.getAttribute('aria-disabled') === 'true'), n: z.length };");
check(map.included, "полная оклейка → все " + map.n + " зон подсвечены как включённые и aria-disabled");
items = (await page.eval(ESTIMATE_ITEMS)).map(nbsp);
check(items.filter((item) => item.includes("Оклейка бронеплёнкой")).length === 0 && items.length === 2, "в смете нет точечных зон — только «Керамика» и «Бронеплёнка — весь кузов» (" + items.length + " поз.)");
await page.click("[data-zone=trunk]");
await sleep(300);
items = (await page.eval(ESTIMATE_ITEMS)).map(nbsp);
check(items.length === 2, "клик по зоне при полной оклейке ничего не меняет");
check(nbsp(await page.eval(TEXT("#estimateTotal"))) === "259 000 ₽", "итог 210 000 + 49 000 = 259 000 ₽");
await page.eval("document.getElementById('bodymap').scrollIntoView({ behavior: 'instant' });");
await sleep(300);
await page.shot("02-full-wrap-zones-included");

// Подсказка экономии: снимаем полную оклейку, выбираем все зоны
await page.click("#packageOptions .option:nth-child(2)");
await sleep(200);
// Фары — две фигуры в одной зоне: центр рамки между ними, кликаем в левую фару
await page.click("[data-zone=headlights]", 0.12, 0.5);
for (const zone of ["roof", "doors-left", "doors-right", "trunk", "rear-bumper"]) {
  await page.click("[data-zone=" + zone + "]");
}
await sleep(300);
const saving = nbsp(await page.eval(TEXT("#zoneSaving")));
check(saving.includes("Полная оклейка выйдет на 7 000 ₽ дешевле"), "подсказка экономии: «" + saving.split("Выбрать")[0].trim() + "»");
await page.eval("document.getElementById('bodymap').scrollIntoView({ behavior: 'instant' });");
await sleep(200);
await page.shot("03-saving-hint");
await page.click("#switchToFull");
await sleep(600);
items = (await page.eval(ESTIMATE_ITEMS)).map(nbsp);
check(items.length === 2 && (await page.eval("return document.getElementById('zoneSaving').hidden;")), "кнопка «Выбрать полную оклейку» → зоны не дублируются, подсказка спрятана");

// Маска телефона и Backspace через «) » и «-»
await page.eval("const el = document.getElementById('fieldPhone'); el.scrollIntoView({ block: 'center', behavior: 'instant' });");
await page.click("#fieldPhone");
await page.type("89991234567");
let phone = await page.eval("return document.getElementById('fieldPhone').value;");
check(phone === "+7 (999) 123-45-67", "ввод с 8 → " + phone);
for (let i = 0; i < 3; i++) {
  await page.key("Backspace", "Backspace", 8);
}
phone = await page.eval("return document.getElementById('fieldPhone').value;");
check(phone === "+7 (999) 123-4", "3× Backspace с конца проходит через «-»: " + phone);
await page.eval("const el = document.getElementById('fieldPhone'); el.setSelectionRange(9, 9);");
await page.key("Backspace", "Backspace", 8);
phone = await page.eval("const el = document.getElementById('fieldPhone'); return el.value + '|' + el.selectionStart;");
check(phone === "+7 (991) 234|6", "Backspace сразу после «) » стёр цифру, а не застрял: " + phone.split("|")[0] + " (курсор " + phone.split("|")[1] + ")");
await page.eval("const el = document.getElementById('fieldPhone'); el.select();");
await page.key("Backspace", "Backspace", 8);
await page.type("+7 999 765 43 21".replace(/\s/g, ""));
phone = await page.eval("return document.getElementById('fieldPhone').value;");
check(phone === "+7 (999) 765-43-21", "ввод с +7 → " + phone);

// Валидная форма → модалка
await page.click("#fieldName");
await page.type("Иван");
await page.click("#fieldCar");
await page.type("Toyota Land Cruiser");
await page.click("#orderForm button[type=submit]");
await sleep(500);
let modal = await page.eval("const d = document.getElementById('successDialog'); return { open: d.open, modal: d.matches(':modal'), title: document.getElementById('modalTitle').textContent, number: document.getElementById('modalNumber').textContent, car: document.getElementById('modalCar').textContent, phone: document.getElementById('modalPhone').textContent, total: document.getElementById('modalTotal').textContent, demo: d.textContent.includes('Демо-режим: данные никуда не отправляются') };");
check(modal.open && modal.modal, "валидная форма → открыт <dialog> через showModal()");
check(modal.title === "Смета успешно сгенерирована и отправлена мастеру", "заголовок модалки точный");
check(/^SG-\d{6}-\d{3}$/.test(modal.number), "номер сметы: " + modal.number);
check(modal.car === "Toyota Land Cruiser · Внедорожник" && modal.phone === "+7 (999) 765-43-21" && nbsp(modal.total) === "259 000 ₽", "в модалке машина, класс, телефон и итог (" + modal.car + ", " + nbsp(modal.total) + ")");
check(modal.demo, "подпись «Демо-режим: данные никуда не отправляются»");
await page.shot("04-success-dialog");
const cleared = await page.eval("return ['fieldName', 'fieldPhone', 'fieldCar'].every(id => document.getElementById(id).value === '');");
check(cleared, "после успеха форма очищена");
await page.key("Escape", "Escape", 27);
await sleep(300);
check(!(await page.eval("return document.getElementById('successDialog').open;")), "Esc закрывает модалку");

// Закрытие кликом по фону
await page.eval("document.getElementById('successDialog').showModal();");
await sleep(400);
await page.clickAt(8, 8);
await sleep(300);
check(!(await page.eval("return document.getElementById('successDialog').open;")), "клик по фону закрывает модалку");
await page.eval("document.getElementById('successDialog').showModal();");
await sleep(400);
await page.click("#modalClose");
await sleep(300);
check(!(await page.eval("return document.getElementById('successDialog').open;")), "кнопка «Понятно» закрывает модалку");

check(page.jsErrors() === 0, "ошибок в консоли нет (" + page.jsErrors() + ")");
await page.close();

/* ================= Телефон 375 ================= */
console.log("Телефон 375×812");
const phonePage = await openPage(375, 812, true);
let bar = await phonePage.eval("return document.getElementById('totalBar').classList.contains('is-visible');");
check(!bar, "пустая смета — плашки итога нет");
await phonePage.click("#packageOptions .option:nth-child(3)");
await phonePage.eval("window.scrollTo(0, 0);");
await sleep(700);
bar = await phonePage.eval("const b = document.getElementById('totalBar'); const r = b.getBoundingClientRect(); return { visible: b.classList.contains('is-visible'), inView: r.bottom <= innerHeight && r.top > 0, text: b.textContent.replace(/\\s+/g, ' ').trim() };");
check(bar.visible && bar.inView, "липкая плашка внизу: «" + nbsp(bar.text) + "»");
await phonePage.shot("05-mobile-total-bar");
await phonePage.eval("document.getElementById('estimateCard').scrollIntoView({ block: 'center', behavior: 'instant' });");
await sleep(700);
bar = await phonePage.eval("return document.getElementById('totalBar').classList.contains('is-visible');");
check(!bar, "смета на экране → плашка спрятана");
const wide = await phonePage.eval("return document.documentElement.scrollWidth > innerWidth;");
check(!wide, "нет горизонтального скролла на 375");
check(phonePage.jsErrors() === 0, "ошибок в консоли нет (" + phonePage.jsErrors() + ")");
await phonePage.close();

console.log("\npass=" + passed + " fail=" + failed);
await send("Browser.close").catch(() => {});
await sleep(1000);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  // профиль может быть ещё занят Chrome — не критично
}
process.exit(failed ? 1 : 0);
