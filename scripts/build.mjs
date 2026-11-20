// Склеивает src/core.js + src/main.js в один userscript для Tampermonkey.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const read = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

const header = `// ==UserScript==
// @name         FreakRating Stencil
// @namespace    https://github.com/Dm5Xia9/freakrating-pixel
// @version      ${pkg.version}
// @description  Трафарет для пиксель-баттла в комнате «Художка»: картинка на полу, подсказка цвета, прогресс и стрелка к работе.
// @match        https://freakrating.lol/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/Dm5Xia9/freakrating-pixel
// @updateURL    https://raw.githubusercontent.com/Dm5Xia9/freakrating-pixel/main/tampermonkey/freakrating-stencil.user.js
// @downloadURL  https://raw.githubusercontent.com/Dm5Xia9/freakrating-pixel/main/tampermonkey/freakrating-stencil.user.js
// ==/UserScript==
// Сгенерировано scripts/build.mjs — правь src/core.js и src/main.js.
`;

const out = `${header}\n${read('core.js')}\n${read('main.js')}`;
writeFileSync(new URL('../tampermonkey/freakrating-stencil.user.js', import.meta.url), out);
console.log(`tampermonkey/freakrating-stencil.user.js — ${(out.length / 1024).toFixed(1)} КБ, v${pkg.version}`);
