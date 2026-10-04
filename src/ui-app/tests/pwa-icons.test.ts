/**
 * PWA icon/manifest parity with the macOS dock icon (#0645): the renderer
 * draws light and dark artwork, keeps installs distinguishable via a
 * name-derived gradient rotation, and the manifest wires both variants —
 * including maskable — to `prefers-color-scheme` via `media`. The chosen repo
 * color (#0280) still overrides the accent and must be URL-encoded so `#`
 * isn't a fragment.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderPwaIcon } from "../../server/icons.js";
import { buildPwaManifest, serveIcon, setIconRenderer } from "../../server/routes/ui.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("renderPwaIcon (#0645)", () => {
  it("emits a PNG for both the light and dark variants", () => {
    for (const theme of ["light", "dark"] as const) {
      const png = renderPwaIcon("demo", 192, undefined, theme);
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(png.length).toBeGreaterThan(1000);
    }
  });

  it("renders visibly different light and dark artwork", () => {
    const light = renderPwaIcon("demo", 64, undefined, "light");
    const dark = renderPwaIcon("demo", 64, undefined, "dark");
    expect(light.equals(dark)).toBe(false);
  });

  it("distinguishes installs by repo name yet is deterministic", () => {
    const a = renderPwaIcon("alpha", 64, undefined, "dark");
    const b = renderPwaIcon("beta", 64, undefined, "dark");
    expect(a.equals(b)).toBe(false);
    expect(a.equals(renderPwaIcon("alpha", 64, undefined, "dark"))).toBe(true);
  });

  it("uses the chosen color as an accent and ignores invalid hex", () => {
    const plain = renderPwaIcon("demo", 64, undefined, "dark");
    const colored = renderPwaIcon("demo", 64, "#9E8FD0", "dark");
    expect(colored.equals(plain)).toBe(false);
    // An invalid color falls back to the brand palette rather than throwing.
    expect(renderPwaIcon("demo", 64, "not-a-color", "dark").equals(plain)).toBe(true);
  });

  it("renders maskable artwork edge-to-edge, distinct from the dock inset", () => {
    const dock = renderPwaIcon("demo", 64, undefined, "dark", false);
    const maskable = renderPwaIcon("demo", 64, undefined, "dark", true);
    expect(maskable.equals(dock)).toBe(false);
  });
});

describe("buildPwaManifest (#0645)", () => {
  const manifest = buildPwaManifest("demo", null);
  const icons = manifest.icons;

  it("declares a light and a dark variant for each size", () => {
    for (const size of ["192x192", "512x512"]) {
      const variants = icons.filter((i) => i.sizes === size && !i.purpose);
      expect(variants.map((i) => i.media).sort()).toEqual([
        "(prefers-color-scheme: dark)",
        "(prefers-color-scheme: light)",
      ]);
      for (const v of variants) {
        expect(v.src).toContain(`/icons/icon-${size.split("x")[0]}.png`);
        expect(v.src).toContain(`theme=${v.media?.includes("dark") ? "dark" : "light"}`);
      }
    }
  });

  it("declares theme-aware maskable variants using the edge-to-edge artwork", () => {
    const maskable = icons.filter((i) => i.purpose === "maskable");
    expect(maskable).toHaveLength(2);
    expect(maskable.map((i) => i.media).sort()).toEqual([
      "(prefers-color-scheme: dark)",
      "(prefers-color-scheme: light)",
    ]);
    for (const icon of maskable) {
      expect(icon.src).toContain("maskable=1");
      expect(icon.src).toContain(`theme=${icon.media?.includes("dark") ? "dark" : "light"}`);
    }
  });

  it("URL-encodes the chosen color so '#' is not a URL fragment", () => {
    const colored = buildPwaManifest("demo", "#9e8fd0");
    for (const icon of colored.icons) {
      expect(icon.src).toContain("c=%239e8fd0");
      expect(icon.src).not.toContain("#");
    }
  });
});

describe("serveIcon (#0645)", () => {
  afterEach(() => setIconRenderer(() => Buffer.from("")));

  function run(url: string, param1: string) {
    const calls: Array<{ size: number; color?: string; theme?: string; maskable?: boolean }> = [];
    setIconRenderer((size, color, theme, maskable) => {
      calls.push({ size, color, theme, maskable });
      return Buffer.from("png");
    });
    const res = {
      statusCode: 0,
      body: "",
      writeHead(code: number) {
        res.statusCode = code;
        return res;
      },
      end(payload: Buffer | string) {
        res.body = payload.toString();
      },
    };
    serveIcon({} as never, { url } as never, res as never, { param1 } as never);
    return { res, calls };
  }

  it("passes the requested theme through to the renderer", () => {
    expect(run("/icons/icon-192.png?theme=light", "192").calls[0]).toEqual({
      size: 192,
      color: undefined,
      theme: "light",
      maskable: false,
    });
    expect(run("/icons/icon-512.png?theme=dark", "512").calls[0].theme).toBe("dark");
  });

  it("decodes the color and defaults the theme to dark", () => {
    const { calls } = run("/icons/icon-192.png?c=%239E8FD0", "192");
    expect(calls[0]).toEqual({ size: 192, color: "#9e8fd0", theme: "dark", maskable: false });
  });

  it("passes the maskable flag through", () => {
    expect(run("/icons/icon-512.png?theme=light&maskable=1", "512").calls[0].maskable).toBe(true);
  });

  it("rejects unsupported sizes", () => {
    expect(run("/icons/icon-64.png", "64").res.statusCode).toBe(404);
  });
});
