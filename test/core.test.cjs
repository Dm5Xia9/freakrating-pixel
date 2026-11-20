const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

// Фейковый слой с тем же устройством, что у игрового (тайлы 256×256, colors Int8Array, ключ row*columns+col).
function fakeLayer(bounds) {
  const P = 256;
  const layer = {
    originX: bounds.world_min_x, originZ: bounds.world_min_z,
    columns: Math.ceil((bounds.world_max_x - bounds.world_min_x) / P),
    rows: Math.ceil((bounds.world_max_z - bounds.world_min_z) / P),
    tiles: new Map(), version: 0,
  };
  layer.tileKey = (x, z) => Math.floor((z - layer.originZ) / P) * layer.columns + Math.floor((x - layer.originX) / P);
  layer.set = (x, z, c) => {
    const k = layer.tileKey(x, z);
    if (!layer.tiles.has(k)) layer.tiles.set(k, { colors: new Int8Array(P * P).fill(-1) });
    const lx = ((x - layer.originX) % P + P) % P, lz = ((z - layer.originZ) % P + P) % P;
    layer.tiles.get(k).colors[lz * P + lx] = c;
    layer.version++;
  };
  layer.at = (x, z) => {
    const t = layer.tiles.get(layer.tileKey(x, z));
    if (!t) return -1;
    const lx = ((x - layer.originX) % P + P) % P, lz = ((z - layer.originZ) % P + P) % P;
    return t.colors[lz * P + lx];
  };
  return layer;
}
const img = (w, h, px) => ({ width: w, height: h, data: Uint8ClampedArray.from(px.flat()) });

test('палитра: точные цвета квантуются в себя, имена русские', () => {
  const pal = C.buildPalette(['white', 'black', 'red', 'red_dark', 'blue']);
  const px = pal.rgb.map(c => [...c, 255]);
  assert.deepEqual([...C.quantize(img(5, 1, px), pal)], [0, 1, 2, 3, 4]);
  assert.equal(pal.ru[3], 'гранатовый');
});

test('квантование: прозрачность и ближайший цвет в OKLab', () => {
  const pal = C.buildPalette(['white', 'black', 'navy', 'red']);
  const q = C.quantize(img(4, 1, [[255, 255, 255, 10], [20, 20, 30, 255], [30, 40, 100, 255], [200, 30, 30, 255]]), pal);
  assert.deepEqual([...q], [-1, 1, 2, 3]);
});

test('дизеринг: серый 50% даёт смесь белого и чёрного', () => {
  const pal = C.buildPalette(['white', 'black']);
  const px = Array.from({ length: 64 }, () => [128, 128, 128, 255]);
  const q = C.quantize(img(8, 8, px), pal, { dither: true });
  const whites = [...q].filter(v => v === 0).length;
  assert.ok(whites > 10 && whites < 54, `белых ${whites}`);
});

test('RLE и код трафарета туда-обратно', () => {
  const pal = C.buildPalette();
  const cells = Int16Array.from([-1, -1, 5, 5, 5, 0, -1, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63]);
  const st = C.makeStencil({ name: 'Тест «кот»', x0: -12, z0: 340, w: 5, h: 5, cells, pal });
  assert.deepEqual(st.colors, [pal.names[5], pal.names[0], pal.names[63]]);
  const back = C.fromShareCode('смотри: ' + C.toShareCode(st) + ' конец');
  assert.equal(back.name, 'Тест «кот»');
  assert.deepEqual([back.x0, back.z0, back.w, back.h], [-12, 340, 5, 5]);
  assert.deepEqual([...C.remap(back, pal)], [...cells]);
  assert.deepEqual([...C.deserialize(C.serialize(st)).cells], [...st.cells]);
  assert.throws(() => C.rleDecode('1*5', 4));
});

test('remap: палитра сервера переставлена — цвета переводятся по именам', () => {
  const a = C.buildPalette(['white', 'red', 'blue']);
  const st = C.makeStencil({ w: 3, h: 1, cells: Int16Array.from([2, 1, 0]), pal: a });
  const b = C.buildPalette(['blue', 'white', 'black', 'red']);
  assert.deepEqual([...C.remap(st, b)], [0, 3, 1]);
  const c = C.buildPalette(['white', 'red_dark', 'navy']);   // red и blue пропали → ближайшие
  assert.deepEqual([...C.remap(st, c)], [2, 1, 0]);
});

test('статус клеток: строка dz → z0+dz, столбец dx → x0+dx, через границу тайлов', () => {
  const bounds = { world_min_x: -1000, world_max_x: 1000, world_min_z: -600, world_max_z: 600 };
  const layer = fakeLayer(bounds);
  const pal = C.buildPalette(['white', 'red', 'blue']);
  // Трафарет 3×2 с углом на стыке тайлов: x0 = −1000+255, z0 = −600+255.
  const x0 = -745, z0 = -345;
  const st = { x0, z0, w: 3, h: 2 };
  const target = Int16Array.from([1, 2, -1, 0, 1, 2]);
  layer.set(x0, z0, 1);           // (0,0) готово
  layer.set(x0 + 1, z0, 0);       // (1,0) чужой
  layer.set(x0 + 2, z0, 2);       // (2,0) прозрачно в трафарете — не считается
  layer.set(x0 + 1, z0 + 1, 1);   // (1,1) готово, (0,1) и (2,1) пусто
  const read = C.layerReader(layer);
  for (const [x, z] of [[x0, z0], [x0 + 1, z0 + 1], [x0 + 2, z0 + 1], [0, 0]]) assert.equal(read(x, z), layer.at(x, z));
  const status = new Uint8Array(6);
  const counts = C.computeStatus(st, target, read, status);
  assert.deepEqual([...status], [C.S_DONE, C.S_FOREIGN, C.S_NONE, C.S_NEED, C.S_DONE, C.S_NEED]);
  assert.deepEqual(counts, { done: 2, need: 2, foreign: 1, broken: 0, total: 5 });

  // Порча: готовая клетка закрашена чужим.
  const prev = status.slice();
  layer.set(x0, z0, 2);
  assert.equal(C.computeStatus(st, target, read, status, prev).broken, 1);

  // Вне границ карты читается как пусто.
  assert.equal(read(5000, 0), -1);
  assert.equal(read(-1001, 0), -1);

  // Текстура: строки перевёрнуты (dz=0 → последняя строка), альфа — код статуса.
  const tex = C.fillTexture(st, target, status, pal, new Uint8Array(6 * 4));
  const px = (dx, row) => [...tex.slice((row * 3 + dx) * 4, (row * 3 + dx) * 4 + 4)];
  assert.deepEqual(px(0, 1), [...pal.rgb[1], C.ALPHA[C.S_FOREIGN]]);   // (0,0) теперь чужой
  assert.deepEqual(px(2, 1), [0, 0, 0, 0]);
  assert.deepEqual(px(0, 0), [...pal.rgb[0], C.ALPHA[C.S_NEED]]);      // (0,1)
  assert.deepEqual(px(1, 0), [...pal.rgb[1], C.ALPHA[C.S_DONE]]);      // (1,1)
});

test('ближайшая работа и подсчёт цветов в зоне кисти', () => {
  const st = { x0: 0, z0: 0, w: 4, h: 1 };
  const target = Int16Array.from([1, 2, 2, 1]);
  const status = Uint8Array.from([C.S_DONE, C.S_NEED, C.S_FOREIGN, C.S_NEED]);
  const w = C.nearestWork(st, target, status, 0.5, 0.5, 1, 2.5);
  assert.deepEqual(w.any, { x: 1, z: 0, color: 2 });
  assert.deepEqual(w.same, { x: 3, z: 0, color: 1 });
  assert.equal(w.sameDist, 3);
  assert.deepEqual(w.inReach, [[2, 2]]);
});

test('формат времени', () => {
  assert.equal(C.formatDuration(0), '0 мин');
  assert.equal(C.formatDuration(90), '2 мин');
  assert.equal(C.formatDuration(3 * 3600 + 20 * 60), '3 ч 20 мин');
  assert.equal(C.formatDuration(50 * 3600), '2 дн 2 ч');
});
