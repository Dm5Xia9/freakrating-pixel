// ==UserScript==
// @name         FreakRating Stencil
// @namespace    https://github.com/Dm5Xia9/freakrating-pixel
// @version      0.1.0
// @description  Трафарет для пиксель-баттла в комнате «Художка»: картинка на полу, подсказка цвета, прогресс и стрелка к работе.
// @match        https://freakrating.lol/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/Dm5Xia9/freakrating-pixel
// @updateURL    https://raw.githubusercontent.com/Dm5Xia9/freakrating-pixel/main/tampermonkey/freakrating-stencil.user.js
// @downloadURL  https://raw.githubusercontent.com/Dm5Xia9/freakrating-pixel/main/tampermonkey/freakrating-stencil.user.js
// ==/UserScript==
// Сгенерировано scripts/build.mjs — правь src/core.js и src/main.js.

// FreakRating Stencil — чистая логика без DOM и three.js: палитра, OKLab-квантование,
// компактный код трафарета (RLE), сравнение с холстом. Работает и в браузере, и в Node (тесты).
(function (root) {
  'use strict';

  // 64 цвета игры (canvasLayer-*.js). На холсте клетка хранит номер в rules.palette (массив имён с сервера).
  const COLORS = {
    white: '#F9FFFE', light_gray: '#9D9D97', gray: '#474F52', black: '#1D1D21', brown: '#835432', red: '#B02E26',
    orange: '#F9801D', yellow: '#FED83D', lime: '#80C71F', green: '#5E7C16', cyan: '#169C9C', light_blue: '#3AB3DA',
    blue: '#3C44AA', purple: '#8932B8', magenta: '#C74EBD', pink: '#F38BAA', maroon: '#6E1B1B', coral: '#FF7A5C',
    peach: '#FFCBA4', tan: '#C8A165', cream: '#F3E5BD', olive: '#7D7A2A', mint: '#9EE6B8', teal: '#0F5E5E',
    navy: '#1A2357', sky: '#AEDBF5', lavender: '#B8A2E6', plum: '#5B1F52', white_dark: '#D4D3CD', white_deep: '#BDBCB8',
    light_gray_light: '#AAADAC', light_gray_dark: '#89887E', light_gray_deep: '#79766B', gray_light: '#56666D',
    gray_dark: '#32404B', gray_deep: '#293241', black_light: '#30261F', black_dark: '#0F0F15', black_deep: '#050507',
    brown_dark: '#653C22', brown_deep: '#4E2B17', red_dark: '#941D1B', orange_dark: '#D6660A', orange_deep: '#B1521B',
    yellow_light: '#FDF299', yellow_dark: '#E0AB10', lime_light: '#BFE976', lime_dark: '#4CAA1E', lime_deep: '#017F31',
    green_dark: '#4A5E14', green_deep: '#314510', cyan_light: '#67D2CC', cyan_deep: '#004941', light_blue_dark: '#1F8ABE',
    light_blue_deep: '#16699C', blue_light: '#6277D9', blue_dark: '#2B3388', purple_dark: '#682591', purple_deep: '#3F1564',
    magenta_light: '#E995E2', magenta_dark: '#98338C', pink_light: '#FFC5D1', pink_dark: '#D06481', pink_deep: '#AD3E68',
  };
  const NAMES_RU = {
    white: 'белый', light_gray: 'светло-серый', gray: 'серый', black: 'чёрный', brown: 'коричневый', red: 'красный',
    orange: 'оранжевый', yellow: 'жёлтый', lime: 'лаймовый', green: 'зелёный', cyan: 'бирюзовый', light_blue: 'голубой',
    blue: 'синий', purple: 'фиолетовый', magenta: 'пурпурный', pink: 'розовый', maroon: 'бордовый', coral: 'коралловый',
    peach: 'персиковый', tan: 'песочный', cream: 'кремовый', olive: 'оливковый', mint: 'мятный', teal: 'тёмно-бирюзовый',
    navy: 'тёмно-синий', sky: 'небесный', lavender: 'лавандовый', plum: 'сливовый', white_dark: 'жемчужный',
    white_deep: 'дымчатый', light_gray_light: 'серебристый', light_gray_dark: 'пепельный', light_gray_deep: 'каменный',
    gray_light: 'сизый', gray_dark: 'графитовый', gray_deep: 'асфальтовый', black_light: 'сажевый', black_dark: 'угольный',
    black_deep: 'смоляной', brown_dark: 'каштановый', brown_deep: 'шоколадный', red_dark: 'гранатовый', orange_dark: 'медный',
    orange_deep: 'ржавый', yellow_light: 'лимонный', yellow_dark: 'горчичный', lime_light: 'салатовый', lime_dark: 'травяной',
    lime_deep: 'изумрудный', green_dark: 'болотный', green_deep: 'хвойный', cyan_light: 'аквамариновый', cyan_deep: 'морской',
    light_blue_dark: 'лазурный', light_blue_deep: 'джинсовый', blue_light: 'васильковый', blue_dark: 'кобальтовый',
    purple_dark: 'аметистовый', purple_deep: 'баклажановый', magenta_light: 'орхидейный', magenta_dark: 'фуксия',
    pink_light: 'пудровый', pink_dark: 'фламинго', pink_deep: 'малиновый',
  };

  // Статусы клеток трафарета.
  const S_NONE = 0, S_DONE = 1, S_NEED = 2, S_FOREIGN = 3;

  const hexToRgb = hex => {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbToHex = ([r, g, b]) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();

  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  function rgbToOklab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  function fnv(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  }

  // Палитра сервера: rules.palette — массив имён. Неизвестные имена получают магенту, как в игре.
  function buildPalette(names) {
    const list = Array.from(names || Object.keys(COLORS), String);
    const rgb = list.map(n => hexToRgb(COLORS[n] || '#FF00FF'));
    return {
      names: list,
      rgb,
      hex: list.map(n => COLORS[n] || '#FF00FF'),
      lab: rgb.map(c => rgbToOklab(c[0], c[1], c[2])),
      ru: list.map(n => NAMES_RU[n] || n),
      key: fnv(list.join(',')),
      index: new Map(list.map((n, i) => [n, i])),
    };
  }

  function nearestIndex(pal, r, g, b) {
    const [L, A, B] = rgbToOklab(r, g, b);
    let best = 0, bd = Infinity;
    for (let i = 0; i < pal.lab.length; i++) {
      const p = pal.lab[i], d = (p[0] - L) ** 2 + (p[1] - A) ** 2 + (p[2] - B) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ImageData-подобный объект {data, width, height} → Int16Array номеров палитры (−1 — прозрачно).
  function quantize(img, pal, opts = {}) {
    const { width: w, height: h, data } = img;
    const alphaCut = opts.alphaThreshold ?? 128;
    const out = new Int16Array(w * h);
    const cache = new Map();
    const pick = (r, g, b) => {
      const k = (r << 16) | (g << 8) | b;
      let v = cache.get(k);
      if (v === undefined) { v = nearestIndex(pal, r, g, b); cache.set(k, v); }
      return v;
    };
    if (!opts.dither) {
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        out[i] = data[o + 3] < alphaCut ? -1 : pick(data[o], data[o + 1], data[o + 2]);
      }
      return out;
    }
    // Floyd–Steinberg в sRGB (ошибка в float), выбор цвета — в OKLab.
    const buf = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { buf[i * 3] = data[i * 4]; buf[i * 3 + 1] = data[i * 4 + 1]; buf[i * 3 + 2] = data[i * 4 + 2]; }
    const clamp = v => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3] < alphaCut) { out[i] = -1; continue; }
      const r = clamp(buf[i * 3]), g = clamp(buf[i * 3 + 1]), b = clamp(buf[i * 3 + 2]);
      const c = pick(r, g, b); out[i] = c;
      const p = pal.rgb[c], er = r - p[0], eg = g - p[1], eb = b - p[2];
      const spread = (dx, dy, f) => {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= w || yy >= h) return;
        const j = yy * w + xx;
        if (data[j * 4 + 3] < alphaCut) return;
        buf[j * 3] += er * f; buf[j * 3 + 1] += eg * f; buf[j * 3 + 2] += eb * f;
      };
      spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
    }
    return out;
  }

  // ---------- Трафарет: хранение и обмен ----------
  // В хранилище клетки лежат номерами в собственном списке имён цветов stencil.colors, а не в палитре сервера:
  // если сервер переставит палитру, трафарет переводится по именам без потерь (remap).
  function rleEncode(arr) {
    const parts = [];
    for (let i = 0; i < arr.length;) {
      const v = arr[i]; let n = 1;
      while (i + n < arr.length && arr[i + n] === v) n++;
      parts.push(n === 1 ? (v + 1).toString(36) : `${(v + 1).toString(36)}*${n.toString(36)}`);
      i += n;
    }
    return parts.join('.');
  }
  function rleDecode(str, length) {
    const out = new Int16Array(length).fill(-1);
    let i = 0;
    if (str) for (const part of str.split('.')) {
      const [v, n] = part.split('*');
      const val = parseInt(v, 36) - 1, cnt = n ? parseInt(n, 36) : 1;
      if (!Number.isFinite(val) || !Number.isFinite(cnt) || i + cnt > length) throw new Error('Битый код трафарета');
      out.fill(val, i, i + cnt); i += cnt;
    }
    if (i !== length) throw new Error('Битый код трафарета: не та длина');
    return out;
  }

  // Квантованный результат (индексы палитры pal) → трафарет с локальным списком цветов.
  function makeStencil({ name, x0 = 0, z0 = 0, w, h, cells, pal }) {
    const used = new Map(), colors = [], local = new Int16Array(w * h);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c < 0) { local[i] = -1; continue; }
      let k = used.get(c);
      if (k === undefined) { k = colors.length; used.set(c, k); colors.push(pal.names[c]); }
      local[i] = k;
    }
    return { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || 'Трафарет', x0, z0, w, h, colors, cells: local };
  }

  function serialize(st) {
    return { id: st.id, name: st.name, x0: st.x0, z0: st.z0, w: st.w, h: st.h, colors: st.colors, cells: rleEncode(st.cells) };
  }
  function deserialize(o) {
    const w = o.w | 0, h = o.h | 0;
    if (!(w > 0 && h > 0 && w <= 4096 && h <= 4096)) throw new Error('Неверный размер трафарета');
    if (!Array.isArray(o.colors)) throw new Error('Нет цветов трафарета');
    const cells = rleDecode(String(o.cells || ''), w * h);
    for (const c of cells) if (c >= o.colors.length) throw new Error('Цвет вне списка');
    return { id: String(o.id || ('s' + Date.now().toString(36))), name: String(o.name || 'Трафарет').slice(0, 60), x0: Math.round(+o.x0 || 0), z0: Math.round(+o.z0 || 0), w, h, colors: o.colors.map(String), cells };
  }

  const SHARE_PREFIX = 'FRST1:';
  const b64 = typeof btoa === 'function'
    ? { enc: s => btoa(unescape(encodeURIComponent(s))), dec: s => decodeURIComponent(escape(atob(s))) }
    : { enc: s => Buffer.from(s, 'utf8').toString('base64'), dec: s => Buffer.from(s, 'base64').toString('utf8') };
  function toShareCode(st) {
    const o = serialize(st); delete o.id;
    return SHARE_PREFIX + b64.enc(JSON.stringify(o));
  }
  function fromShareCode(text) {
    const m = String(text).match(/FRST1:([A-Za-z0-9+/=]+)/);
    if (!m) return null;
    const st = deserialize(JSON.parse(b64.dec(m[1])));
    st.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return st;
  }

  // Локальные номера трафарета → номера текущей палитры сервера. Пропавший цвет подбирается ближайшим.
  function remap(st, pal) {
    const map = st.colors.map(n => pal.index.has(n) ? pal.index.get(n) : (COLORS[n] ? nearestIndex(pal, ...hexToRgb(COLORS[n])) : 0));
    const out = new Int16Array(st.cells.length);
    for (let i = 0; i < out.length; i++) out[i] = st.cells[i] < 0 ? -1 : map[st.cells[i]];
    return out;
  }

  // ---------- Сравнение с холстом ----------
  // Быстрое чтение клеток прямо из тайлов слоя (layer.tiles[key].colors), без вызова at() на каждую клетку.
  function layerReader(layer, P = 256) {
    const tiles = layer.tiles, ox = layer.originX, oz = layer.originZ, cols = layer.columns, rows = layer.rows;
    let lastKey = -2, last = null;
    return (x, z) => {
      const tx = Math.floor((x - ox) / P), tz = Math.floor((z - oz) / P);
      if (tx < 0 || tz < 0 || tx >= cols || tz >= rows) return -1;
      const key = tz * cols + tx;
      if (key !== lastKey) { lastKey = key; last = tiles.get(key) || null; }
      if (!last) return -1;
      return last.colors[(z - oz - tz * P) * P + (x - ox - tx * P)];
    };
  }

  // target: Int16Array номеров палитры (remap), read(x, z) → номер на холсте или −1.
  // Заполняет status (Uint8Array) и возвращает счётчики. prev (необязательно) — прошлый status, чтобы поймать порчу.
  function computeStatus(st, target, read, status, prev) {
    let done = 0, need = 0, foreign = 0, broken = 0;
    const { w, h, x0, z0 } = st;
    for (let dz = 0; dz < h; dz++) {
      const row = dz * w, z = z0 + dz;
      for (let dx = 0; dx < w; dx++) {
        const i = row + dx, t = target[i];
        if (t < 0) { status[i] = S_NONE; continue; }
        const cur = read(x0 + dx, z);
        let s;
        if (cur === t) { s = S_DONE; done++; }
        else if (cur < 0) { s = S_NEED; need++; }
        else { s = S_FOREIGN; foreign++; if (prev && prev[i] === S_DONE) broken++; }
        status[i] = s;
      }
    }
    return { done, need, foreign, broken, total: done + need + foreign };
  }

  // Ближайшие клетки к покраске. px, pz — игрок в клетках карты, reachCells — дальность кисти в клетках.
  // Возвращает ближайшую любую, ближайшую цвета color и сколько клеток каждого цвета в пределах дальности.
  function nearestWork(st, target, status, px, pz, color, reachCells) {
    const { w, h, x0, z0 } = st;
    let any = null, anyD = Infinity, same = null, sameD = Infinity;
    const inReach = new Map();
    const r2 = reachCells * reachCells;
    for (let dz = 0; dz < h; dz++) {
      const ddz = z0 + dz + 0.5 - pz, row = dz * w;
      for (let dx = 0; dx < w; dx++) {
        const s = status[row + dx];
        if (s !== S_NEED && s !== S_FOREIGN) continue;
        const ddx = x0 + dx + 0.5 - px, d = ddx * ddx + ddz * ddz, t = target[row + dx];
        if (d < anyD) { anyD = d; any = { x: x0 + dx, z: z0 + dz, color: t }; }
        if (t === color && d < sameD) { sameD = d; same = { x: x0 + dx, z: z0 + dz, color: t }; }
        if (d <= r2) inReach.set(t, (inReach.get(t) || 0) + 1);
      }
    }
    return { any, anyDist: Math.sqrt(anyD), same, sameDist: Math.sqrt(sameD), inReach: [...inReach].sort((a, b) => b[1] - a[1]) };
  }

  // RGBA-данные текстуры трафарета. Строки перевёрнуты, как у холста: клетка dz → строка h−1−dz.
  // RGB — целевой цвет (sRGB), альфа — код статуса для шейдера.
  const ALPHA = { [S_NONE]: 0, [S_DONE]: 64, [S_NEED]: 128, [S_FOREIGN]: 255, ghost: 192 };
  function fillTexture(st, target, status, pal, out, ghost) {
    const { w, h } = st;
    for (let dz = 0; dz < h; dz++) {
      const row = dz * w, o0 = (h - 1 - dz) * w * 4;
      for (let dx = 0; dx < w; dx++) {
        const i = row + dx, o = o0 + dx * 4, t = target[i];
        if (t < 0) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
        const c = pal.rgb[t] || [255, 0, 255];
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
        out[o + 3] = ghost ? ALPHA.ghost : ALPHA[status[i]];
      }
    }
    return out;
  }

  function formatDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return '0 мин';
    const m = Math.ceil(sec / 60);
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} ч ${m % 60} мин`;
    return `${Math.floor(h / 24)} дн ${h % 24} ч`;
  }

  const api = {
    COLORS, NAMES_RU, S_NONE, S_DONE, S_NEED, S_FOREIGN, ALPHA,
    hexToRgb, rgbToHex, rgbToOklab, buildPalette, nearestIndex, quantize,
    rleEncode, rleDecode, makeStencil, serialize, deserialize, toShareCode, fromShareCode, remap,
    layerReader, computeStatus, nearestWork, fillTexture, formatDuration,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FRStencilCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// FreakRating Stencil — трафарет для пиксель-баттла в 3D-комнате «Художка».
// Обычный скрипт без import/export: сборка склеивает core.js + этот файл в userscript.
// Ничего не рисует за игрока: показывает трафарет на полу, подсказывает цвет и путь к работе.
(() => {
  'use strict';
  const C = window.FRStencilCore;
  window.FRStencil?.destroy?.();

  const STORE = 'frstencil:v1';
  const REACH = 46;            // дальность кисти в метрах комнаты (клиент игры, pt)
  const RENDER_ORDER = 4;      // слот между холстом (3) и курсором (5)
  const RECALC_MS = 250;
  const MAX_SIDE = 1024;
  const log = (...a) => console.info('[FR Stencil]', ...a);
  const warnOnce = (() => { const seen = new Set(); return (k, ...a) => { if (!seen.has(k)) { seen.add(k); console.warn('[FR Stencil]', ...a); } }; })();

  // ---------- Состояние и хранилище ----------
  const state = {
    stencils: [], activeId: null,
    visible: true, autoPick: false, showDone: false, arrow: true, hint: true, opacity: 1,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (raw) {
      for (const k of ['activeId', 'visible', 'autoPick', 'showDone', 'arrow', 'hint', 'opacity']) if (k in raw) state[k] = raw[k];
      for (const s of raw.stencils || []) { try { state.stencils.push(C.deserialize(s)); } catch (e) { console.warn('[FR Stencil] пропущен битый трафарет', e); } }
    }
  } catch (e) { console.warn('[FR Stencil] не прочитал настройки', e); }
  const persist = () => {
    try {
      const { stencils, ...rest } = state;
      localStorage.setItem(STORE, JSON.stringify({ ...rest, stencils: stencils.map(C.serialize) }));
      return true;
    } catch (e) { console.warn('[FR Stencil] не сохранил', e); return false; }
  };
  const active = () => state.stencils.find(s => s.id === state.activeId) || null;

  // ---------- Подключение к движку мира ----------
  async function findEngineUrl() {
    const re = /\/assets\/engine-[\w-]+\.js/;
    const fromPerf = performance.getEntriesByType('resource').map(e => e.name).find(n => re.test(n));
    if (fromPerf) return fromPerf;
    const link = [...document.querySelectorAll('link[rel=modulepreload],script[src]')].map(l => l.href || l.src).find(u => re.test(u || ''));
    if (link) return link;
    if (!/\/world\//.test(location.pathname)) return null;
    // Как в FreakRating DJ: app → WorldPage → engine.
    const app = [...document.scripts].map(s => s.src).find(src => /\/assets\/app-/.test(src));
    if (!app) return null;
    const appText = await (await fetch(app)).text();
    const worldPath = appText.match(/assets\/WorldPage-[\w-]+\.js/)?.[0];
    if (!worldPath) return null;
    const worldText = await (await fetch(new URL('/' + worldPath, location.origin))).text();
    const enginePath = worldText.match(/assets\/engine-[\w-]+\.js/)?.[0];
    return enginePath ? new URL('/' + enginePath, location.origin).href : null;
  }

  let installTimer = 0, destroyed = false;
  async function install() {
    if (destroyed) return;
    let url = null;
    try { url = await findEngineUrl(); } catch (e) { warnOnce('find', 'поиск движка', e); }
    if (!url) { installTimer = setTimeout(install, 2000); return; }
    try {
      const mod = await import(url);
      const WE = mod.WorldEngine || Object.values(mod).find(v => typeof v === 'function' && v.prototype?.renderScene);
      const proto = WE?.prototype;
      if (!proto?.renderScene) throw new Error('нет WorldEngine.renderScene');
      if (!proto.__frStencilOrig) {
        const orig = proto.renderScene;
        proto.__frStencilOrig = orig;
        proto.renderScene = function (...args) {
          try { window.__frStencilFrame?.(this); } catch (e) { warnOnce(String(e?.message), 'кадр', e); }
          return orig.apply(this, args);
        };
      }
      window.__frStencilFrame = onFrame;
      log('подключён к', url.split('/').pop());
    } catch (e) {
      console.error('[FR Stencil] не подключился к движку', e);
      installTimer = setTimeout(install, 5000);
    }
  }

  // ---------- Конструкторы three.js у живых объектов ----------
  function findThree(room, engine) {
    let mesh = null, dataTex = null, anyTex = null;
    const visit = o => {
      if (!mesh && o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.material?.type === 'MeshBasicMaterial') mesh = o;
      const map = o.material?.map;
      if (map) { if (map.isDataTexture && !dataTex) dataTex = map; anyTex ||= map; }
    };
    for (const t of room.layer.tiles.values()) { visit(t.mesh); break; }
    if (!mesh || !dataTex) room.group.traverse(visit);
    if (!dataTex) engine.scene?.traverse?.(visit);
    if (!mesh || !(dataTex || anyTex)) return null;
    let Texture = null;
    if (!dataTex) {   // базовый Texture: поднимаемся по цепочке классов до наследника EventDispatcher
      let T = anyTex.constructor;
      while (T && !Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(T.prototype), 'addEventListener')) T = Object.getPrototypeOf(T);
      Texture = T || anyTex.constructor;
    }
    return {
      Mesh: mesh.constructor, Plane: mesh.geometry.constructor, Basic: mesh.material.constructor,
      DataTexture: dataTex?.constructor || null, Texture, Vector3: mesh.position.constructor,
    };
  }

  function makeTexture(three, w, h) {
    let tex, data, upload;
    if (three.DataTexture) {
      data = new Uint8Array(w * h * 4);
      tex = new three.DataTexture(data, w, h);
      upload = () => { tex.needsUpdate = true; };
    } else {
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(w, h);
      data = img.data;
      tex = new three.Texture(canvas);
      upload = () => { ctx.putImageData(img, 0, 0); tex.needsUpdate = true; };
    }
    tex.flipY = false;
    tex.magFilter = tex.minFilter = 1003;   // NearestFilter: альфа — код статуса, смешивать нельзя
    tex.generateMipmaps = false;
    tex.colorSpace = 'srgb';
    return { tex, data, upload };
  }

  // Метки рисует шейдер MeshBasicMaterial (onBeforeCompile): внутри клетки — кружок «надо», крест «чужой»,
  // контур клетки, который пропадает, когда клетка на экране мельче ~8 px.
  const FRAG_HEAD = 'uniform vec2 uSize;\nuniform float uTime;\nuniform float uShowDone;\nuniform float uAlpha;\n';
  const fragMap = uv => `
  vec4 stTex = texture2D( map, ${uv} );
  vec2 cu = ${uv} * uSize;
  vec2 fw = max( fwidth( cu ), vec2( 1e-5 ) );
  float code = stTex.a;
  if ( code < 0.1 || ( code < 0.375 && uShowDone < 0.5 ) ) discard;
  vec2 f = fract( cu );
  float px = 1.0 / max( fw.x, fw.y );
  float detail = smoothstep( 5.0, 12.0, px );
  vec2 ed = min( f, 1.0 - f ) / fw;
  float edge = ( 1.0 - smoothstep( 0.5, 1.5, min( ed.x, ed.y ) ) ) * detail;
  float aa = 1.5 / px;
  vec3 col = stTex.rgb;
  float a;
  vec3 red = vec3( 1.0, 0.06, 0.06 );
  if ( code < 0.375 ) {
    col = mix( col, vec3( 0.1, 0.85, 0.25 ), 0.6 );
    a = 0.12 + 0.18 * edge;
  } else if ( code < 0.625 ) {
    float d = length( f - 0.5 );
    float ring = 1.0 - smoothstep( 0.0, aa, abs( d - 0.2 ) - 0.05 );
    a = mix( 0.5, 0.35, detail );
    col = mix( col, mix( col, vec3( 1.0 ), 0.5 ), ring * detail );
    a = max( a, ring * detail * 0.95 );
    col = mix( col, vec3( 0.0 ), edge * 0.55 );
    a = max( a, edge * 0.5 );
  } else if ( code < 0.875 ) {
    a = 0.72;
    col = mix( col, vec3( 1.0 ), edge * 0.7 );
    a = max( a, edge );
  } else {
    float xm = 1.0 - smoothstep( 0.07, 0.07 + aa, min( abs( f.x - f.y ), abs( f.x + f.y - 1.0 ) ) );
    float pulse = 0.5 + 0.5 * sin( uTime * 5.0 );
    a = 0.88;
    col = mix( col, red, xm * detail );
    col = mix( col, red, ( 1.0 - detail ) * 0.45 * pulse );
    col = mix( col, red, edge );
  }
  diffuseColor.rgb *= col;
  diffuseColor.a *= a * uAlpha;
`;
  function makeMaterial(three, tex, uniforms) {
    const m = new three.Basic({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      // Свой varying: имена встроенных (vUv / vMapUv) зависят от версии three, а атрибут uv объявлен всегда.
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vStUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vStUv;\n' + FRAG_HEAD)
        .replace('#include <map_fragment>', fragMap('vStUv'));
    };
    m.customProgramCacheKey = () => 'frstencil-v2';
    return m;
  }

  // ---------- Комната ----------
  let att = null;           // привязка к комнате художки
  let lastAttachTry = 0;
  const place = { on: false, frozen: false, x0: 0, z0: 0, backup: null };

  function onFrame(engine) {
    if (destroyed) return;
    const room = engine.room;
    const art = room && room.rules?.cells_url && room.layer && room.frame ? room : null;
    if (att && (att.room !== art || att.layer !== art?.layer)) detach();
    if (!att && art) {
      const now = performance.now();
      if (now - lastAttachTry < 1000) return;
      lastAttachTry = now;
      attach(art, engine);
    }
    if (att) tick();
  }

  function attach(room, engine) {
    const three = findThree(room, engine);
    if (!three) { warnOnce('three', 'жду меши холста, чтобы взять конструкторы three.js'); return; }
    att = {
      room, engine, three, layer: room.layer, frame: room.frame,
      pal: C.buildPalette(room.rules.palette),
      mesh: null, tex: null, uniforms: null, target: null, status: null, prev: null,
      version: -1, lastCalc: 0, dirty: true, counts: null, work: null, lastWork: 0,
      brokenAcc: 0, brokenToastAt: 0, lastHud: 0, pickedFor: null,
    };
    log('художка: палитра', att.pal.names.length, 'цв., масштаб', room.frame.scale, 'границы', room.frame.bounds, 'ведро', room.rules.capacity, '/', room.rules.accrual_seconds, 'с');
    rebuildMesh();
    ui.update();
  }

  function detach() {
    if (!att) return;
    if (place.on) cancelPlacing();
    disposeMesh();
    att = null;
    ui.update();
    overlay.clear();
  }

  function disposeMesh() {
    if (!att?.mesh) return;
    att.mesh.removeFromParent();
    att.mesh.geometry.dispose();
    att.mesh.material.dispose();
    att.tex.tex.dispose();
    att.mesh = att.tex = att.uniforms = att.target = att.status = att.prev = null;
    att.counts = att.work = null;
  }

  function rebuildMesh() {
    if (!att) return;
    disposeMesh();
    const st = active();
    if (!st) return;
    const { three, frame } = att;
    att.target = C.remap(st, att.pal);
    att.status = new Uint8Array(st.w * st.h);
    att.prev = null;
    att.tex = makeTexture(three, st.w, st.h);
    att.uniforms = { uSize: { value: [st.w, st.h] }, uTime: { value: 0 }, uShowDone: { value: state.showDone ? 1 : 0 }, uAlpha: { value: state.opacity } };
    const mesh = new three.Mesh(new three.Plane(st.w * frame.cell, st.h * frame.cell), makeMaterial(three, att.tex.tex, att.uniforms));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = RENDER_ORDER;
    mesh.name = 'fr-stencil';
    att.mesh = mesh;
    positionMesh(st.x0, st.z0);
    att.room.group.add(mesh);
    att.dirty = true;
  }

  function positionMesh(x0, z0) {
    const st = active();
    if (!att?.mesh || !st) return;
    att.mesh.position.set(att.frame.roomX(x0 + st.w / 2), 0, att.frame.roomZ(z0 + st.h / 2));
  }

  function recompute(st) {
    const { layer } = att;
    const read = C.layerReader(layer);
    const counts = C.computeStatus(st, att.target, read, att.status, att.prev);
    att.prev ||= new Uint8Array(att.status.length);
    att.prev.set(att.status);
    att.version = layer.version;
    att.counts = counts;
    C.fillTexture(st, att.target, att.status, att.pal, att.tex.data, false);
    att.tex.upload();
    if (counts.broken > 0) {
      att.brokenAcc += counts.broken;
      const now = performance.now();
      if (now - att.brokenToastAt > 15000) {
        att.brokenToastAt = now;
        gameToast(`«${st.name}» портят: ${att.brokenAcc} кл. закрашено чужим цветом`, 'error', 5);
        att.brokenAcc = 0;
      }
    }
  }

  function tick() {
    const { room, frame } = att;
    const st = active();
    const now = performance.now();
    if (!st || !att.mesh) { overlay.clear(); ui.hint(null); return; }
    att.uniforms.uTime.value = now / 1000;
    att.mesh.visible = state.visible || place.on;

    if (place.on) {
      if (!place.frozen && room.aim) {
        place.x0 = room.aim.x - Math.floor(st.w / 2);
        place.z0 = room.aim.z - Math.floor(st.h / 2);
      }
      positionMesh(place.x0, place.z0);
      ui.hint(null);
      overlay.clear();
      return;
    }

    if ((att.dirty || att.version !== att.layer.version) && now - att.lastCalc >= RECALC_MS) {
      att.dirty = false;
      att.lastCalc = now;
      recompute(st);
    }

    const player = room.context.player();
    if (now - att.lastWork >= RECALC_MS && att.counts) {
      att.lastWork = now;
      const px = frame.centerX + player.position.x * frame.scale, pz = frame.centerZ + player.position.z * frame.scale;
      att.work = C.nearestWork(st, att.target, att.status, px, pz, room.color, REACH * frame.scale);
    }

    // Подсказка под прицелом и автовыбор цвета (только когда кисть не рисует — штрих остаётся ручным).
    const aim = room.aim;
    let hint = null;
    if (aim && state.hint && state.visible) {
      const dx = aim.x - st.x0, dz = aim.z - st.z0;
      if (dx >= 0 && dz >= 0 && dx < st.w && dz < st.h) {
        const i = dz * st.w + dx, t = att.target[i];
        if (t >= 0) {
          hint = { t, status: att.status[i] };
          if (state.autoPick && !room.painting && hint.status !== C.S_DONE && room.color !== t && att.pickedFor !== i) {
            att.pickedFor = i;
            room.pickColor(t);
          }
        }
      }
    }
    if (!hint) att.pickedFor = null;
    ui.hint(hint, room);
    overlay.draw();
    if (now - att.lastHud > 250) { att.lastHud = now; ui.bar(); }
  }

  // ---------- Установка ----------
  function startPlacing() {
    const st = active();
    if (!att || !st) { ui.toast('Зайди в «Художку» и выбери трафарет'); return; }
    place.on = true; place.frozen = false;
    place.backup = { x0: st.x0, z0: st.z0 };
    place.x0 = st.x0; place.z0 = st.z0;
    C.fillTexture(st, att.target, att.status, att.pal, att.tex.data, true);
    att.tex.upload();
    ui.setPanel(false);
    gameToast('Наведи прицел и кликни ЛКМ. Стрелки — сдвиг на клетку (Shift — на 10), Enter — готово, Esc — отмена', 'info', 8);
    ui.update();
  }
  function finishPlacing(ok) {
    const st = active();
    place.on = false;
    if (st && ok) { st.x0 = place.x0; st.z0 = place.z0; persist(); gameToast(`Трафарет стоит: ${st.x0}, ${st.z0}`, 'info', 3); }
    if (st) positionMesh(st.x0, st.z0);
    if (att) { att.dirty = true; att.prev = null; att.lastCalc = 0; }
    ui.update();
  }
  const cancelPlacing = () => finishPlacing(false);

  // ---------- Тосты ----------
  function gameToast(text, kind = 'info', sec = 3.6) {
    try { if (att?.room?.hud?.toast) { att.room.hud.toast(text, 'Трафарет', kind, sec); return; } } catch { /* ignore */ }
    ui.toast(text, kind === 'error');
  }

  // ---------- Импорт картинки ----------
  const imp = { bitmap: null, name: '', w: 0, h: 0, cells: null, pal: null };
  async function importBlob(blob, name) {
    try {
      const bitmap = await createImageBitmap(blob);
      imp.bitmap?.close?.();
      imp.bitmap = bitmap;
      imp.name = (name || 'картинка').replace(/\.[^.]+$/, '').slice(0, 40);
      const big = Math.max(bitmap.width, bitmap.height);
      const k = big > 256 ? 128 / big : 1;
      imp.w = Math.max(1, Math.round(bitmap.width * k));
      ui.setPanel(true);
      ui.importShow();
    } catch (e) {
      console.warn('[FR Stencil] картинка', e);
      ui.toast('Не получилось открыть картинку', true);
    }
  }
  function quantizeImport(width, dither) {
    const bm = imp.bitmap;
    if (!bm) return;
    const w = Math.max(1, Math.min(MAX_SIDE, width | 0));
    const h = Math.max(1, Math.min(MAX_SIDE, Math.round(bm.height * w / bm.width)));
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = w < bm.width;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bm, 0, 0, w, h);
    imp.pal = att?.pal || C.buildPalette();
    imp.cells = C.quantize(ctx.getImageData(0, 0, w, h), imp.pal, { dither });
    imp.w = w; imp.h = h;
  }
  function addImported() {
    if (!imp.cells) return;
    let x0 = 0, z0 = 0;
    if (att) {
      const p = att.room.context.player().position, f = att.frame;
      x0 = f.cellX(p.x) - Math.floor(imp.w / 2); z0 = f.cellZ(p.z) - Math.floor(imp.h / 2);
    }
    const st = C.makeStencil({ name: imp.name, x0, z0, w: imp.w, h: imp.h, cells: imp.cells, pal: imp.pal });
    addStencil(st);
    imp.bitmap?.close?.(); imp.bitmap = null; imp.cells = null;
    ui.importHide();
    if (att) startPlacing();
  }
  function addStencil(st) {
    state.stencils.push(st);
    state.activeId = st.id;
    if (!persist()) ui.toast('Трафарет добавлен, но не сохранится: мало места в браузере', true);
    rebuildMesh();
    ui.update();
  }

  // ---------- 2D-оверлей: стрелка к ближайшей работе ----------
  const overlay = (() => {
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646';
    const g = cv.getContext('2d');
    let shown = false, vec = null;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1, W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    return {
      el: cv,
      clear() { if (shown) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); shown = false; } },
      draw() {
        this.clear();
        const w = att?.work, st = active();
        if (!state.arrow || !state.visible || !w?.any || !st || ui.panelOpen) return;
        const { room, frame, three } = att;
        const reachCells = REACH * frame.scale;
        const tgt = w.same && w.sameDist <= reachCells ? w.same : w.any;
        const dist = (tgt === w.same ? w.sameDist : w.anyDist) / frame.scale;
        const cam = room.context.camera, rect = room.context.renderer.domElement.getBoundingClientRect();
        vec ||= new three.Vector3();
        vec.set(frame.roomX(tgt.x + 0.5), 0, frame.roomZ(tgt.z + 0.5)).project(cam);
        fit(); shown = true;
        const hex = att.pal.hex[tgt.color] || '#f0f';
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        let sx = rect.left + (vec.x + 1) / 2 * rect.width, sy = rect.top + (1 - vec.y) / 2 * rect.height;
        const behind = vec.z > 1;
        const onScreen = !behind && sx > rect.left + 20 && sx < rect.right - 20 && sy > rect.top + 20 && sy < rect.bottom - 20;
        const label = `${att.pal.ru[tgt.color]} · ${dist < 10 ? dist.toFixed(1) : Math.round(dist)} м`;
        g.font = '600 12px system-ui,sans-serif';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)';
        if (onScreen) {
          const r = 9 + 2 * Math.sin(performance.now() / 180);
          g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = hex; g.lineWidth = 2; g.stroke();
          g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)';
          g.strokeText(label, sx + 14, sy + 4); g.fillStyle = '#fff'; g.fillText(label, sx + 14, sy + 4);
          return;
        }
        let dx = sx - cx, dy = sy - cy;
        if (behind) { dx = -dx; dy = -dy; }
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        const k = Math.min((rect.width / 2 - 36) / Math.abs(dx || 1e-6), (rect.height / 2 - 36) / Math.abs(dy || 1e-6));
        const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx);
        g.save(); g.translate(ax, ay); g.rotate(ang);
        g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -9); g.lineTo(-3, 0); g.lineTo(-8, 9); g.closePath();
        g.fillStyle = hex; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.8)'; g.stroke();
        g.restore();
        const tx = ax - dx * 26 - g.measureText(label).width / 2, ty = ay - dy * 26 + 4;
        g.lineWidth = 3; g.strokeText(label, tx, ty); g.fillStyle = '#fff'; g.fillText(label, tx, ty);
      },
    };
  })();

  // ---------- HUD ----------
  const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.bar{position:fixed;top:8px;left:50%;transform:translateX(-50%);display:none;gap:10px;align-items:center;padding:5px 10px;background:rgba(14,12,20,.82);color:#eee;border:2px solid #3a3450;border-radius:6px;font-size:12px;white-space:nowrap;pointer-events:none}
.bar.on{display:flex}
.bar b{color:#fff}.bar .bad{color:#ff7a7a}.bar .ok{color:#7dffa0}.bar .dim{color:#9a94ad}
.sw{display:inline-block;width:10px;height:10px;border:1px solid rgba(0,0,0,.6);border-radius:2px;vertical-align:-1px;margin-right:3px}
.hint{position:fixed;display:none;padding:3px 7px;background:rgba(14,12,20,.86);color:#fff;border-radius:5px;font-size:12px;pointer-events:none;white-space:nowrap;border:1px solid #3a3450}
.hint.on{display:block}.hint .bad{color:#ff7a7a}.hint .ok{color:#7dffa0}.hint em{font-style:normal;color:#ffd84a}
.panel{position:fixed;top:50px;right:12px;width:300px;max-height:calc(100vh - 70px);overflow:auto;display:none;padding:10px 12px;background:rgba(16,14,24,.96);color:#e8e6ef;border:2px solid #3a3450;border-radius:8px;font-size:12px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.panel.on{display:block}
h2{margin:0 0 8px;font-size:14px;display:flex;justify-content:space-between;align-items:center}
h3{margin:12px 0 6px;font-size:12px;color:#a9a3c0;text-transform:uppercase;letter-spacing:.04em}
.row{display:flex;gap:6px;align-items:center;margin:5px 0}
.row>label{flex:1}
input,select,button{font:inherit;color:#eee;background:#24203a;border:1px solid #453e63;border-radius:4px;padding:4px 6px}
input[type=number]{width:80px}
input[type=text]{flex:1;min-width:0}
input[type=range]{flex:1;padding:0}
input[type=checkbox]{margin:0 6px 0 0;vertical-align:-2px}
select{flex:1;min-width:0}
button{cursor:pointer;background:#342c58}
button:hover{background:#44397a}
button.x{background:none;border:none;font-size:16px;padding:0 4px}
button.danger{background:#5a2433}
.drop{margin:6px 0;padding:10px;border:2px dashed #453e63;border-radius:6px;text-align:center;color:#a9a3c0;cursor:pointer}
.drop.over{border-color:#a974ff;color:#fff}
.preview{display:block;margin:6px auto;width:100%;height:auto;max-height:200px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#2a2640 0 25%,#1c1a2b 0 50%) 0/12px 12px}
.stats{color:#cfcae0;line-height:1.5}
.keys{color:#8f89a6;line-height:1.6}
kbd{background:#2a2541;border:1px solid #453e63;border-radius:3px;padding:0 4px;font-size:11px}
.toast{position:fixed;bottom:60px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(14,12,20,.95);color:#fff;border:2px solid #3a3450;border-radius:6px;font-size:12px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.on{opacity:1}.toast.err{border-color:#ff7a8a}
[hidden]{display:none!important}
`;
  const ui = (() => {
    const host = document.createElement('freakrating-stencil');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;display:block!important';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
<div class="bar"></div>
<div class="hint"></div>
<div class="toast"></div>
<section class="panel" style="pointer-events:auto">
  <h2>Трафарет <button class="x" data-a="close" title="Закрыть (Shift+Y)">✕</button></h2>
  <div class="row"><select class="list"></select><button data-a="del" class="danger" title="Удалить">🗑</button></div>
  <div class="cur">
    <div class="row"><input type="text" class="name" maxlength="60" placeholder="Название"></div>
    <div class="row"><label>Угол X <input type="number" class="x0"></label><label>Z <input type="number" class="z0"></label></div>
    <div class="row"><button data-a="place">Поставить прицелом</button><button data-a="tp">Телепорт к центру</button></div>
    <div class="row"><button data-a="share">Копировать код</button></div>
    <div class="stats"></div>
  </div>
  <h3>Добавить</h3>
  <div class="drop">Перетащи PNG/JPG сюда, вставь (Ctrl+V)<br>картинку или код трафарета, или кликни</div>
  <input type="file" class="file" accept="image/*" hidden>
  <div class="imp" hidden>
    <canvas class="preview"></canvas>
    <div class="row"><label>Ширина, клеток <input type="number" class="iw" min="1" max="${MAX_SIDE}"></label></div>
    <div class="row"><label><input type="checkbox" class="dither">Дизеринг</label></div>
    <div class="stats istats"></div>
    <div class="row"><button data-a="add">Добавить и поставить</button><button data-a="cancel">Отмена</button></div>
  </div>
  <h3>Показ</h3>
  <div class="row"><label><input type="checkbox" data-k="visible">Показывать на полу <kbd>Shift+T</kbd></label></div>
  <div class="row"><label><input type="checkbox" data-k="hint">Подсказка цвета под прицелом</label></div>
  <div class="row"><label><input type="checkbox" data-k="autoPick">Сам выбирать цвет под прицелом</label></div>
  <div class="row"><label><input type="checkbox" data-k="arrow">Стрелка к ближайшей клетке</label></div>
  <div class="row"><label><input type="checkbox" data-k="showDone">Отмечать готовые клетки</label></div>
  <div class="row">Прозрачность <input type="range" min="0.2" max="1" step="0.05" data-k="opacity"></div>
  <div class="keys"><kbd>Shift+Y</kbd> панель · <kbd>Shift+T</kbd> показ · <kbd>Shift+H</kbd> поставить</div>
</section>`;
    const $ = s => root.querySelector(s);
    const panel = $('.panel'), bar = $('.bar'), hintEl = $('.hint'), toastEl = $('.toast');
    // Ввод в наших полях не должен доходить до игры (T/Enter открывают чат, WASD двигают).
    // Наши хоткеи срабатывают раньше, в перехватчике на window.
    for (const ev of ['keydown', 'keyup', 'keypress']) panel.addEventListener(ev, e => e.stopPropagation());
    panel.addEventListener('mousedown', e => e.stopPropagation());
    panel.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

    const mount = () => {
      const parent = document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body;
      if (!parent) return;
      if (host.parentElement !== parent) parent.append(host);
      if (overlay.el.parentElement !== parent) parent.insertBefore(overlay.el, host);
    };
    document.addEventListener('fullscreenchange', mount);
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });

    let toastTimer = 0;
    const api = {
      host, mount,
      get panelOpen() { return panel.classList.contains('on'); },
      toast(text, err = false) {
        toastEl.textContent = text;
        toastEl.classList.toggle('err', err);
        toastEl.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('on'), 3500);
      },
      setPanel(on) {
        if (on === api.panelOpen) return;
        panel.classList.toggle('on', on);
        if (on) {
          if (document.pointerLockElement) document.exitPointerLock();
          api.update();
        } else if (att && att.room.mode === 'walk') {
          try { att.room.context.renderer.domElement.requestPointerLock()?.catch?.(() => {}); } catch { /* клик по игре вернёт курсор */ }
        }
      },
      update() {
        const st = active();
        const list = $('.list');
        list.replaceChildren(...state.stencils.map(s => Object.assign(document.createElement('option'), { value: s.id, textContent: `${s.name} (${s.w}×${s.h})`, selected: s.id === state.activeId })));
        if (!state.stencils.length) list.append(Object.assign(document.createElement('option'), { textContent: 'Трафаретов пока нет', disabled: true, selected: true }));
        $('.cur').hidden = !st;
        $('[data-a=del]').disabled = !st;
        if (st) {
          if (root.activeElement !== $('.name')) $('.name').value = st.name;
          if (root.activeElement !== $('.x0')) $('.x0').value = st.x0;
          if (root.activeElement !== $('.z0')) $('.z0').value = st.z0;
          $('[data-a=place]').disabled = $('[data-a=tp]').disabled = !att;
        }
        for (const el of root.querySelectorAll('[data-k]')) {
          if (el.type === 'checkbox') el.checked = !!state[el.dataset.k]; else el.value = state[el.dataset.k];
        }
        api.stats();
        api.bar();
      },
      stats() {
        const st = active(), el = $('.cur .stats');
        if (!st) { el.textContent = ''; return; }
        const total = st.cells.reduce((n, c) => n + (c >= 0), 0);
        const lines = [`${st.w}×${st.h}, ${total} клеток, ${st.colors.length} цветов`];
        if (att?.counts) {
          const c = att.counts, left = c.need + c.foreign;
          lines.push(`Готово ${c.done} из ${c.total} (${Math.floor(100 * c.done / Math.max(1, c.total))}%), чужих ${c.foreign}`);
          lines.push(`Осталось ${left} кл. ≈ ${C.formatDuration(left * (att.room.rules.accrual_seconds || 0))} капель`);
        } else if (!att) lines.push('Зайди в «Художку», чтобы увидеть прогресс');
        el.innerHTML = lines.map(l => `<div>${esc(l)}</div>`).join('');
      },
      bar() {
        const st = active();
        const on = !!(att && st && state.visible && !place.on);
        bar.classList.toggle('on', on || place.on);
        if (place.on) { bar.innerHTML = `<b>Установка «${esc(st?.name)}»</b><span>${place.x0}, ${place.z0}</span><span class="dim">ЛКМ / Enter — готово · Esc — отмена</span>`; return; }
        if (!on || !att.counts) return;
        const c = att.counts, w = att.work, room = att.room;
        const paint = typeof room.available === 'function' ? room.available() : room.bucket?.paint;
        const pct = Math.floor(100 * c.done / Math.max(1, c.total));
        const reach = (w?.inReach || []).slice(0, 4).map(([t, n]) => `<span><i class="sw" style="background:${att.pal.hex[t]}"></i>${esc(att.pal.ru[t])} ${n}</span>`).join('');
        bar.innerHTML = `<b>${esc(st.name)}</b><span class="ok">${c.done}/${c.total} · ${pct}%</span><span>надо ${c.need}</span>` +
          (c.foreign ? `<span class="bad">чужих ${c.foreign}</span>` : '') +
          (paint !== undefined ? `<span>краски ${paint}</span>` : '') +
          `<span class="dim">≈ ${C.formatDuration((c.need + c.foreign) * (room.rules.accrual_seconds || 0))}</span>` +
          (reach ? `<span class="dim">рядом:</span>${reach}` : '');
        if (api.panelOpen) api.stats();
      },
      hint(h, room) {
        if (!h || api.panelOpen) { hintEl.classList.remove('on'); return; }
        const rect = room.context.renderer.domElement.getBoundingClientRect();
        let x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        if (room.mode === 'draw') { if (!room.pointerAt) { hintEl.classList.remove('on'); return; } x = rect.left + room.pointerAt.x; y = rect.top + room.pointerAt.y; }
        const pal = att.pal, slot = (room.slots || []).indexOf(h.t);
        const st = h.status === C.S_DONE ? '<span class="ok">✓ готово</span>' : h.status === C.S_FOREIGN ? '<span class="bad">чужой цвет</span>' : '';
        const mine = room.color === h.t;
        const html = `<i class="sw" style="background:${pal.hex[h.t]}"></i>${esc(pal.ru[h.t])} <span class="dim">№${h.t + 1}</span>` +
          (slot >= 0 ? ` <em>[${(slot + 1) % 10}]</em>` : '') + (mine && h.status !== C.S_DONE ? ' <span class="ok">в кисти</span>' : '') + (st ? ' ' + st : '');
        if (hintEl.dataset.html !== html) { hintEl.innerHTML = html; hintEl.dataset.html = html; }
        hintEl.style.left = `${Math.round(x + 18)}px`;
        hintEl.style.top = `${Math.round(y + 16)}px`;
        hintEl.classList.add('on');
      },
      importShow() {
        $('.imp').hidden = false;
        $('.iw').value = imp.w;
        api.importRender();
      },
      importHide() { $('.imp').hidden = true; },
      importRender() {
        quantizeImport(+$('.iw').value || imp.w, $('.dither').checked);
        if (!imp.cells) return;
        const cv = $('.preview');
        cv.width = imp.w; cv.height = imp.h;
        const g = cv.getContext('2d'), id = g.createImageData(imp.w, imp.h);
        let n = 0; const used = new Set();
        for (let i = 0; i < imp.cells.length; i++) {
          const c = imp.cells[i]; if (c < 0) continue;
          n++; used.add(c);
          const rgb = imp.pal.rgb[c]; id.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
        }
        g.putImageData(id, 0, 0);
        const acc = att?.room.rules.accrual_seconds;
        $('.istats').innerHTML = `<div>${imp.w}×${imp.h}: ${n} клеток, ${used.size} цветов</div>` +
          (acc ? `<div>С нуля ≈ ${esc(C.formatDuration(n * acc))} капель (1 капля / ${acc} с)</div>` : '') +
          (n > 20000 ? '<div class="bad">Очень много клеток — подумай о меньшей ширине</div>' : '');
      },
    };

    // ---------- Обработчики панели ----------
    panel.addEventListener('click', e => {
      const a = e.target.closest?.('[data-a]')?.dataset.a;
      const st = active();
      if (a === 'close') api.setPanel(false);
      else if (a === 'del' && st && confirm(`Удалить трафарет «${st.name}»?`)) {
        state.stencils = state.stencils.filter(s => s !== st);
        state.activeId = state.stencils[0]?.id || null;
        persist(); rebuildMesh(); api.update();
      } else if (a === 'place') startPlacing();
      else if (a === 'tp' && att && st) att.room.teleportTo(st.x0 + Math.floor(st.w / 2), st.z0 + Math.floor(st.h / 2));
      else if (a === 'share' && st) {
        navigator.clipboard.writeText(C.toShareCode(st)).then(() => api.toast('Код трафарета скопирован'), () => api.toast('Буфер обмена недоступен', true));
      } else if (a === 'add') addImported();
      else if (a === 'cancel') { imp.bitmap?.close?.(); imp.bitmap = null; imp.cells = null; api.importHide(); }
    });
    $('.list').addEventListener('change', e => { state.activeId = e.target.value; persist(); rebuildMesh(); api.update(); });
    $('.name').addEventListener('change', e => { const st = active(); if (st) { st.name = e.target.value.trim() || st.name; persist(); api.update(); } });
    const onPos = () => {
      const st = active(); if (!st) return;
      const x = Math.round(+$('.x0').value), z = Math.round(+$('.z0').value);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      st.x0 = x; st.z0 = z; persist(); positionMesh(x, z);
      if (att) { att.dirty = true; att.prev = null; }
    };
    $('.x0').addEventListener('change', onPos);
    $('.z0').addEventListener('change', onPos);
    $('.iw').addEventListener('change', () => api.importRender());
    $('.dither').addEventListener('change', () => api.importRender());
    for (const el of root.querySelectorAll('[data-k]')) {
      el.addEventListener('input', () => {
        const k = el.dataset.k;
        state[k] = el.type === 'checkbox' ? el.checked : +el.value;
        if (att?.uniforms) { att.uniforms.uShowDone.value = state.showDone ? 1 : 0; att.uniforms.uAlpha.value = state.opacity; }
        persist(); api.bar();
      });
    }
    const drop = $('.drop'), file = $('.file');
    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { const f = file.files?.[0]; if (f) importBlob(f, f.name); file.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('over');
      const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
      if (f) importBlob(f, f.name);
      else tryCode(e.dataTransfer?.getData('text') || '');
    });
    return api;
  })();

  function tryCode(text) {
    try {
      const st = C.fromShareCode(text);
      if (!st) return false;
      addStencil(st);
      ui.toast(`Трафарет «${st.name}» добавлен`);
      return true;
    } catch (e) { ui.toast(e.message || 'Не тот код', true); return true; }
  }
  // Вставка работает, пока открыта панель: картинка или код FRST1:…
  const onPaste = e => {
    if (!ui.panelOpen) return;
    const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
    if (f) { e.preventDefault(); importBlob(f, 'вставка'); return; }
    const text = e.clipboardData?.getData('text') || '';
    if (/FRST1:/.test(text)) { e.preventDefault(); tryCode(text); }
  };
  document.addEventListener('paste', onPaste, true);

  // ---------- Клавиши и мышь ----------
  const editable = t => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  // Возвращает true, если событие наше (уже обработано и погашено).
  function hotkey(e) {
    const t = e.composedPath()[0];
    if (place.on && att && !editable(t)) {
      const step = e.shiftKey ? 10 : 1;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.code];
      if (mv) { place.frozen = true; place.x0 += mv[0]; place.z0 += mv[1]; }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') finishPlacing(true);
      else if (e.code === 'Escape') cancelPlacing();
      else if (!(e.shiftKey && e.code === 'KeyH')) return false;
      else cancelPlacing();
      e.preventDefault(); e.stopImmediatePropagation(); ui.bar();
      return true;
    }
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat || editable(t)) return false;
    if (e.code === 'KeyY') ui.setPanel(!ui.panelOpen);
    else if (e.code === 'KeyT' && att) {   // игра открывает чат на KeyT даже с Shift — гасим раньше неё
      state.visible = !state.visible; persist(); ui.update();
      gameToast(state.visible ? 'Трафарет показан' : 'Трафарет скрыт', 'info', 1.6);
    } else if (e.code === 'KeyH' && att) startPlacing();
    else return false;
    e.preventDefault(); e.stopImmediatePropagation();
    return true;
  }
  const onKey = e => { hotkey(e); };
  window.addEventListener('keydown', onKey, true);
  const onMouse = e => {
    if (!place.on || !att || e.button !== 0) return;
    if (e.target !== att.room.context.renderer.domElement) return;
    if (!document.pointerLockElement && att.room.mode !== 'draw') return;   // пусть клик захватит курсор
    e.preventDefault(); e.stopImmediatePropagation();
    finishPlacing(true);
  };
  window.addEventListener('mousedown', onMouse, true);

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  // ---------- Публичный API ----------
  window.FRStencil = {
    state, get attached() { return att; }, core: C,
    open: () => ui.setPanel(true),
    add: addStencil,
    debug() { return att ? { rules: att.room.rules, floor: att.room.floor, scale: att.frame.scale, bounds: att.frame.bounds, counts: att.counts } : null; },
    destroy() {
      destroyed = true;
      clearTimeout(installTimer);
      detach();
      if (window.__frStencilFrame === onFrame) window.__frStencilFrame = null;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('fullscreenchange', ui.mount);
      ui.host.remove(); overlay.el.remove();
      delete window.FRStencil;
    },
  };
  install();
})();
