// generate-og-image.js
// 외부 의존성 없이 Node.js 내장 zlib만으로 1200×630 OG 이미지 생성
const { deflateSync } = require('zlib');
const { writeFileSync } = require('fs');
const { resolve } = require('path');

const W = 1200, H = 630;
const img = Buffer.alloc(W * H * 3, 0); // RGB, 검정 배경

// ── 픽셀 조작 ──────────────────────────────────────────────
function setPixel(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = r; img[i + 1] = g; img[i + 2] = b;
}

// Bresenham + 두께
function drawLine(x0, y0, x1, y1, r, g, b, half = 10) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, cx = x0, cy = y0;
  while (true) {
    for (let px = cx - half; px <= cx + half; px++)
      for (let py = cy - half; py <= cy + half; py++)
        if ((px - cx) ** 2 + (py - cy) ** 2 <= half * half)
          setPixel(px, py, r, g, b);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx)  { err += dx; cy += sy; }
  }
}

function drawCircle(cx, cy, radius, fr, fg, fb, sr, sg, sb, sw) {
  for (let px = cx - radius - sw; px <= cx + radius + sw; px++)
    for (let py = cy - radius - sw; py <= cy + radius + sw; py++) {
      const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (d <= radius)        setPixel(px, py, fr, fg, fb);
      else if (d <= radius + sw) setPixel(px, py, sr, sg, sb);
    }
}

// ── 디자인 ──────────────────────────────────────────────────
// 미묘한 배경 그라데이션 (순수 검정 → 약간 밝은 검정)
for (let y = 0; y < H; y++) {
  const v = Math.round((y / H) * 18); // 0~18
  for (let x = 0; x < W; x++) setPixel(x, y, v, v, v);
}

// 고도선 경로: SVG M4 18 L8 10 L12 14 L16 6 L20 12 (24×24) 를
// 1200×630 캔버스에 맞게 스케일링 (패딩 160px)
// x: 4→160, 20→1040   scale = (1040-160)/(20-4) = 55
// y: 6→140, 18→490    scale = (490-140)/(18-6)  = ~29.2
const pts = [
  [160,  490],  // (4,18)
  [380,  200],  // (8,10)
  [600,  315],  // (12,14)
  [820,  140],  // (16,6)
  [1040, 257],  // (20,12)
];

// 선 아래 영역을 반투명 흰색으로 채워 Area 느낌 표현
for (let x = 0; x < W; x++) {
  // 현재 x에 해당하는 선의 y값 계산 (선형 보간)
  let lineY = H;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) {
      lineY = Math.round(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
      break;
    }
  }
  for (let y = lineY; y < H; y++) {
    const i = (y * W + x) * 3;
    const alpha = 0.07 * (1 - (y - lineY) / (H - lineY + 1));
    img[i]     = Math.min(255, img[i]     + Math.round(255 * alpha));
    img[i + 1] = Math.min(255, img[i + 1] + Math.round(255 * alpha));
    img[i + 2] = Math.min(255, img[i + 2] + Math.round(255 * alpha));
  }
}

// 메인 고도선 (흰색)
for (let i = 0; i < pts.length - 1; i++)
  drawLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 255, 255, 255, 7);

// 끝점 원형 마커
drawCircle(pts[0][0], pts[0][1], 14, 52, 211, 153, 255, 255, 255, 4); // 초록 (시작)
drawCircle(pts[4][0], pts[4][1], 14, 239, 68, 68, 255, 255, 255, 4);  // 빨강 (끝)

// "Trail" 텍스트: 픽셀 폰트로 직접 그리기 (5×7 도트)
const FONT = {
  T: [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  r: [[0,0,0,0,0],[0,0,0,0,0],[0,1,1,1,0],[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0]],
  a: [[0,0,0,0,0],[0,0,0,0,0],[0,1,1,1,0],[1,0,0,1,0],[1,1,1,1,0],[1,0,0,1,0],[1,0,0,1,0]],
  i: [[0,1,0],[0,0,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  l: [[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,1]],
};
const SCALE = 14, GAP = 6;
const chars = ['T','r','a','i','l'];
const totalW = chars.reduce((s, c) => s + FONT[c][0].length * SCALE + GAP, -GAP);
let tx = Math.round((W - totalW) / 2);
const ty = 390;

for (const ch of chars) {
  const glyph = FONT[ch];
  for (let row = 0; row < glyph.length; row++)
    for (let col = 0; col < glyph[row].length; col++)
      if (glyph[row][col])
        for (let sy = 0; sy < SCALE; sy++)
          for (let sx = 0; sx < SCALE; sx++)
            setPixel(tx + col * SCALE + sx, ty + row * SCALE + sy, 255, 255, 255);
  tx += glyph[0].length * SCALE + GAP;
}

// ── PNG 인코딩 ───────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

// 필터 바이트 (0 = None) 삽입
const rows = Buffer.allocUnsafe(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  rows[y * (1 + W * 3)] = 0;
  img.copy(rows, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}

const ihdr = Buffer.allocUnsafe(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', deflateSync(rows, { level: 6 })),
  makeChunk('IEND', Buffer.alloc(0)),
]);

const out = resolve(__dirname, '../public/og-image.png');
writeFileSync(out, png);
console.log(`✓ ${out} (${(png.length / 1024).toFixed(0)} KB)`);
