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
