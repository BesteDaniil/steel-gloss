/* ==========================================================
   Точка входа: подключает модули. Модули общаются только
   через store — друг друга не вызывают.
   ========================================================== */

import { initConfigurator } from "./configurator.js";
import { initBodyMap } from "./bodymap.js";
import { initEstimate } from "./estimate.js";
import { initForm } from "./form.js";

initConfigurator();
initBodyMap();
initEstimate();
initForm();
