/**
 * Per-instance PWA icons, generated at request time with no runtime deps.
 *
 * Every RepoOS install is a different repo, and installs need to be
 * distinguishable on a home screen. The icon is derived deterministically
 * from the repo name: a rounded square in an instance hue with the RepoOS
 * diamond mark in the same hue. Pure zlib (node:zlib) PNG encoding — no
 * image libraries.
 *
 * When a `color` (hex) is supplied (e.g. the repo's chosen color from the
 * color picker), it overrides the name-derived hue so the installed-app icon
 * matches the tab favicon for the currently-selected repo color.
 */
import { deflateSync } from "node:zlib";

/** Stable 0-359 hue from the repo name. */
function hueFor(name: string): number {
  let h = 2167;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

function hexToRgb(h: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number];
}

/**
 * Derive the icon's color scheme from an explicit hex color. The given color
 * becomes the glowing diamond mark; the rounded-square background is a
 * darkened version of the same hue so the mark stays legible against it.
 * Returns null when the hex is invalid.
 */
function schemeForHex(hex: string): {
  glow: [number, number, number];
  bgTop: [number, number, number];
  bgBottom: [number, number, number];
} | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const scale = (v: number, f: number) => Math.min(255, Math.round(v * f));
  return {
    glow: [r, g, b],
    bgTop: [scale(r, 0.18), scale(g, 0.18), scale(b, 0.22)],
    bgBottom: [scale(r, 0.36), scale(g, 0.36), scale(b, 0.42)],
  };
}

/** True if (x,y) is inside the convex polygon pts (screen coords). */
function inPolygon(x: number, y: number, pts: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Encode an RGBA pixel buffer as a PNG. */
function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // compression(10), filter(11), interlace(12) already 0

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.subarray(y * stride, (y + 1) * stride).forEach((v, i) => {
      raw[y * (stride + 1) + 1 + i] = v;
    });
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Render the per-instance app icon as a PNG.
 * @param repoName instance name used to derive color/lettering
 * @param size icon dimensions (square)
 * @param color optional hex color (e.g. the repo's chosen color) that
 *        overrides the name-derived hue.
 */
export function renderInstanceIcon(repoName: string, size: number, color?: string): Buffer {
  const chosen = color ? schemeForHex(color) : null;
  const hue = chosen ? null : hueFor(repoName);
  const pad = size * 0.07;
  const r = size * 0.22; // rounded-corner radius
  const glow: [number, number, number] = chosen ? chosen.glow : hslToRgb(hue as number, 0.7, 0.5);
  const bgTop: [number, number, number] = chosen
    ? chosen.bgTop
    : hslToRgb(hue as number, 0.55, 0.14);
  const bgBottom: [number, number, number] = chosen
    ? chosen.bgBottom
    : hslToRgb(hue as number, 0.6, 0.26);
  const inner = [7, 10, 18] as const; // --bg-2

  // Diamond mark, same geometry as the favicon (a square rotated 45°).
  const cx = size / 2;
  const d = size * 0.36; // half-diagonal-ish scale
  const outer: Array<[number, number]> = [
    [cx, cx - d],
    [cx + d * 0.87, cx - d * 0.35],
    [cx + d * 0.87, cx + d * 0.35],
    [cx, cx + d],
    [cx - d * 0.87, cx + d * 0.35],
    [cx - d * 0.87, cx - d * 0.35],
  ];
  const innerPts: Array<[number, number]> = outer.map(([x, y]) => {
    const vx = x - cx;
    const vy = y - cx;
    const s = 0.62;
    return [cx + vx * s, cx + vy * s] as [number, number];
  });

  const px = new Uint8Array(size * size * 4);
  const inRoundRect = (x: number, y: number): boolean => {
    if (x < pad || x >= size - pad || y < pad || y >= size - pad) return false;
    const nx = Math.min(Math.max(x, pad + r), size - pad - r);
    const ny = Math.min(Math.max(y, pad + r), size - pad - r);
    const dx = x - nx;
    const dy = y - ny;
    return dx * dx + dy * dy <= r * r;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const a = y / size;
      if (!inRoundRect(x + 0.5, y + 0.5)) continue;
      let c: [number, number, number];
      const inOuter = inPolygon(x + 0.5, y + 0.5, outer);
      if (inOuter)
        c = inPolygon(x + 0.5, y + 0.5, innerPts) ? [inner[0], inner[1], inner[2]] : glow;
      else {
        const t = bgTop[0] + (bgBottom[0] - bgTop[0]) * a;
        const u = bgTop[1] + (bgBottom[1] - bgTop[1]) * a;
        const v = bgTop[2] + (bgBottom[2] - bgTop[2]) * a;
        c = [t, u, v];
      }
      px[o] = Math.round(c[0]);
      px[o + 1] = Math.round(c[1]);
      px[o + 2] = Math.round(c[2]);
      px[o + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}
