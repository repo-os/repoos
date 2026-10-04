/**
 * Per-instance PWA icons, generated at request time with no runtime deps.
 *
 * The artwork mirrors the macOS Hub dock icon
 * (`macos/scripts/generate-app-icons.swift`): a rounded square carrying a
 * cyan→violet conic gradient ring, an inner panel in the theme background,
 * and the RepoOS hexagon mark (accent outline + violet bars). Two variants
 * exist — light and dark — selected by the PWA manifest's `media` member and
 * served through the `theme` query param, so the installed-app icon tracks
 * the OS appearance the same way the native dock icon does.
 *
 * Installs stay distinguishable the way the pre-#0645 renderer intended: the
 * conic gradient's start angle is rotated by a name-derived offset, so every
 * repo gets a unique arrangement while the exact macOS palette and the
 * hexagon mark are preserved (the native dock icon's own orientation is the
 * `nameAngle` 0 case).
 *
 * When a `color` (hex) is supplied (the repo's chosen color from the color
 * picker, #0280), it replaces the accent — the gradient start and the hexagon
 * outline — so the installed-app icon still reflects the chosen repo color.
 *
 * Maskable icons render edge-to-edge (no breathing-room inset), matching the
 * native `AppIcon` artwork rather than the inset dock artwork.
 *
 * Pure zlib (node:zlib) PNG encoding — no image libraries.
 */
import { deflateSync } from "node:zlib";

export type IconTheme = "light" | "dark";

type RGB = [number, number, number];

interface Palette {
  /** Inner panel fill — macOS `bg2`. */
  inner: RGB;
  /** Gradient start + hexagon outline — macOS `cyan`. */
  accent: RGB;
  /** Gradient end + hexagon bars — macOS `violet`. */
  secondary: RGB;
}

/** Theme palettes copied from `generate-app-icons.swift` so the PWA icon
 * matches the native dock icon's light/dark artwork exactly. */
const THEMES: Record<IconTheme, Palette> = {
  light: {
    inner: [0xee, 0xf0, 0xf6],
    accent: [0x06, 0x78, 0xb3],
    secondary: [0x6b, 0x3f, 0xc0],
  },
  dark: {
    inner: [0x0b, 0x10, 0x20],
    accent: [0x39, 0xe0, 0xff],
    secondary: [0x9d, 0x7b, 0xff],
  },
};

/** Supersampling factor: render big, then average down for smooth edges. */
const SUPERSAMPLE = 4;

/** The macOS artwork's SVG viewBox. */
const VB = 24;

/**
 * Hexagon outline vertices from the native SVG path
 * `M12 2L4 7v10l8 5 8-5V7l-8-5z`.
 */
const HEXAGON: Array<[number, number]> = [
  [12, 2],
  [4, 7],
  [4, 17],
  [12, 22],
  [20, 17],
  [20, 7],
];

/** The three vertical bars inside the hexagon (`M12 7v10M8 9.5v5M16 9.5v5`). */
const BARS: Array<[[number, number], [number, number]]> = [
  [
    [12, 7],
    [12, 17],
  ],
  [
    [8, 9.5],
    [8, 14.5],
  ],
  [
    [16, 9.5],
    [16, 14.5],
  ],
];

function hexToRgb(hex: string): RGB | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as RGB;
}

/** Stable 0-359° gradient rotation from the repo name, so installs differ. */
function nameAngle(name: string): number {
  let h = 2167;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Linear blend from `a` to `b` by fraction `f` (0..1), like NSColor.blended. */
function blend(a: RGB, b: RGB, f: number): RGB {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Distance from point (px,py) to the segment (ax,ay)-(bx,by). */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/** True if (x,y) is inside a rounded rect with corner radius `r`. */
function inRoundedRect(x: number, y: number, min: number, max: number, r: number): boolean {
  if (x < min || x >= max || y < min || y >= max) return false;
  const nx = Math.min(Math.max(x, min + r), max - r);
  const ny = Math.min(Math.max(y, min + r), max - r);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= r * r;
}

/** Map a viewBox coordinate into high-res pixel space. */
function toPixel(v: number, origin: number, scale: number): number {
  return origin + (v / VB) * scale;
}

/**
 * Rasterize the icon at `size` (already supersampled) as non-premultiplied
 * RGBA. Only the outer rounded clip paints pixels; corners stay transparent.
 */
function drawIconPixels(
  size: number,
  palette: Palette,
  edgeToEdge: boolean,
  startAngleDeg: number,
): Uint8ClampedArray {
  // Keep the dock icon's breathing room; maskable/app artwork can reach the
  // canvas edge. Matches `canvasInset` in the native generator.
  const inset = edgeToEdge ? 0 : (size * 3) / 30;
  const iconSize = size - inset * 2;
  const outerRadius = (iconSize * 9) / 30;
  const innerInset = (iconSize * 3) / 30;
  const innerRadius = (iconSize * 6) / 30;
  const svgScale = (iconSize * 14) / 30;
  const center = size / 2;
  const outerMin = inset;
  const outerMax = size - inset;
  const innerMin = inset + innerInset;
  const innerMax = size - inset - innerInset;
  const svgOrigin = center - svgScale / 2;

  // Stroke half-widths in pixel space.
  const hexHalf = ((2 / VB) * svgScale) / 2;
  const barHalf = ((1.5 / VB) * svgScale) / 2;
  const hexPts = HEXAGON.map(
    ([vx, vy]) =>
      [toPixel(vx, svgOrigin, svgScale), toPixel(vy, svgOrigin, svgScale)] as [number, number],
  );
  const barSegs = BARS.map(
    ([[ax, ay], [bx, by]]) =>
      [
        toPixel(ax, svgOrigin, svgScale),
        toPixel(ay, svgOrigin, svgScale),
        toPixel(bx, svgOrigin, svgScale),
        toPixel(by, svgOrigin, svgScale),
      ] as [number, number, number, number],
  );

  // Bounding boxes let us skip the expensive stroke test for most pixels.
  const markMin = svgOrigin - hexHalf;
  const markMax = svgOrigin + svgScale + hexHalf;

  // Conic gradient starts at 200° (math coords) and sweeps accent→secondary
  // over the first half, secondary→accent over the second. The name-derived
  // rotation shifts that start so installs differ without changing the palette.
  const TAU = Math.PI * 2;
  const startAngle = (startAngleDeg * Math.PI) / 180;
  const gradientColor = (x: number, y: number): RGB => {
    // Screen y grows downward; flip it to match the native math coordinate.
    const angle = Math.atan2(-(y - center), x - center);
    let t = (angle - startAngle) % TAU;
    if (t < 0) t += TAU;
    t /= TAU;
    return t < 0.5
      ? blend(palette.accent, palette.secondary, t * 2)
      : blend(palette.secondary, palette.accent, (t - 0.5) * 2);
  };

  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const cy = y + 0.5;
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      if (!inRoundedRect(cx, cy, outerMin, outerMax, outerRadius)) continue;

      let color: RGB;
      if (inRoundedRect(cx, cy, innerMin, innerMax, innerRadius)) {
        color = palette.inner;
      } else {
        color = gradientColor(cx, cy);
      }

      // Hexagon mark sits on top of the inner panel.
      if (cx >= markMin && cx <= markMax && cy >= markMin && cy <= markMax) {
        let onStroke = false;
        for (let i = 0; i < hexPts.length && !onStroke; i++) {
          const [ax, ay] = hexPts[i];
          const [bx, by] = hexPts[(i + 1) % hexPts.length];
          onStroke = distToSegment(cx, cy, ax, ay, bx, by) <= hexHalf;
        }
        if (onStroke) {
          color = palette.accent;
        } else {
          for (const [ax, ay, bx, by] of barSegs) {
            if (distToSegment(cx, cy, ax, ay, bx, by) <= barHalf) {
              color = palette.secondary;
              break;
            }
          }
        }
      }

      const o = (y * size + x) * 4;
      px[o] = color[0];
      px[o + 1] = color[1];
      px[o + 2] = color[2];
      px[o + 3] = 255;
    }
  }
  return px;
}

/** Average a supersampled RGBA buffer down to `size`, keeping edges smooth. */
function downsample(hi: Uint8ClampedArray, hiSize: number, size: number): Uint8Array {
  const ss = SUPERSAMPLE;
  const samples = ss * ss;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const idx = (((y * ss + sy) * hiSize + (x * ss + sx)) << 2) + 3;
          if (hi[idx] === 0) continue;
          const base = idx - 3;
          r += hi[base];
          g += hi[base + 1];
          b += hi[base + 2];
          count++;
        }
      }
      const o = (y * size + x) << 2;
      if (count === 0) continue;
      out[o] = Math.round(r / count);
      out[o + 1] = Math.round(g / count);
      out[o + 2] = Math.round(b / count);
      out[o + 3] = Math.round((255 * count) / samples);
    }
  }
  return out;
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
    for (let i = 0; i < stride; i++) {
      raw[y * (stride + 1) + 1 + i] = rgba[y * stride + i];
    }
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
 * Render the PWA app icon as a PNG, matching the macOS Hub dock icon.
 * @param name repo/instance name; rotates the gradient so installs differ
 *        while the macOS palette and mark stay identical.
 * @param size icon dimensions (square)
 * @param color optional hex color (e.g. the repo's chosen color) that
 *        replaces the accent (gradient start + hexagon outline).
 * @param theme light/dark artwork variant (defaults to dark).
 * @param maskable render edge-to-edge for `purpose: "maskable"` use.
 */
export function renderPwaIcon(
  name: string,
  size: number,
  color?: string,
  theme: IconTheme = "dark",
  maskable = false,
): Buffer {
  const base = THEMES[theme] ?? THEMES.dark;
  const custom = color ? hexToRgb(color) : null;
  const palette: Palette = custom ? { ...base, accent: custom } : base;

  const hiSize = size * SUPERSAMPLE;
  const hi = drawIconPixels(hiSize, palette, maskable, 200 + nameAngle(name));
  const rgba = downsample(hi, hiSize, size);
  return encodePng(size, size, rgba);
}
