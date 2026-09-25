#!/usr/bin/env node
/**
 * scripts/generate-icons.mjs
 *
 * Generates the PWA/app icons from scratch so the repo has no binary assets
 * checked in that nobody can reproduce. Produces full-bleed PNGs (safe for
 * maskable icons) using only Node's built-in zlib.
 *
 * Run: node scripts/generate-icons.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Brand palette
const BG = [5, 150, 105]; // emerald-600
const FG = [255, 255, 255];

// 5x7 bitmap glyphs
const GLYPHS = {
  K: [
    "10001",
    "10010",
    "10100",
    "11000",
    "10100",
    "10010",
    "10001",
  ],
  A: [
    "01110",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "10001",
  ],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = 255;
  }

  const letters = ["K", "A"];
  const cell = Math.round(size / 12.8);
  const gap = cell;
  const totalWidth = letters.length * 5 * cell + gap;
  const totalHeight = 7 * cell;
  let cursorX = Math.round((size - totalWidth) / 2);
  const startY = Math.round((size - totalHeight) / 2);

  for (const letter of letters) {
    const glyph = GLYPHS[letter];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;
        const x0 = cursorX + col * cell;
        const y0 = startY + row * cell;
        for (let y = y0; y < y0 + cell; y += 1) {
          for (let x = x0; x < x0 + cell; x += 1) {
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const idx = (y * size + x) * 4;
            rgba[idx] = FG[0];
            rgba[idx + 1] = FG[1];
            rgba[idx + 2] = FG[2];
            rgba[idx + 3] = 255;
          }
        }
      }
    }
    cursorX += 5 * cell + gap;
  }

  return encodePng(size, size, rgba);
}

const outputs = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/maskable-512.png", 512],
  ["public/apple-touch-icon.png", 180],
  ["app/icon.png", 512],
];

for (const [rel, size] of outputs) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, drawIcon(size));
  console.log(`wrote ${rel} (${size}x${size})`);
}