import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkDocsWiring,
  importProjectDocs,
  isZipSource,
  scaffoldStarterDocs,
  STARTER_DOCS,
  type DocsImportResult,
} from "../../core/project-docs";
import { rmFixture } from "./helpers";

const roots: string[] = [];

function scratch(prefix = "repoos-docs-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmFixture(root);
});

function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function write(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

/** Build a zip from an on-disk directory (system `zip`, no runtime dep). */
function zipUp(dir: string, zipPath: string): void {
  const r = spawnSync("zip", ["-qr", zipPath, "."], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`zip failed: ${r.stderr || r.error?.message}`);
}

describe("importProjectDocs", () => {
  it("copies a whole nested directory tree, preserving structure", () => {
    const src = scratch("docs-src-");
    write(src, "README.md", "# Index");
    write(src, "adr/0001-choice.md", "# Choice");
    write(src, "guides/setup.md", "# Setup");

    const dest = join(scratch(), "docs");
    const result: DocsImportResult = importProjectDocs(src, dest);

    expect(result.created.map((e) => e.path).sort()).toEqual([
      "README.md",
      "adr/0001-choice.md",
      "guides/setup.md",
    ]);
    expect(read(dest, "adr/0001-choice.md")).toBe("# Choice");
    expect(result.skipped).toEqual([]);
  });

  it("copies a single loose file into the docs root", () => {
    const src = scratch("docs-file-");
    write(src, "notes.md", "hello");
    const dest = join(scratch(), "docs");
    const result = importProjectDocs(join(src, "notes.md"), dest);

    expect(result.created.map((e) => e.path)).toEqual(["notes.md"]);
    expect(read(dest, "notes.md")).toBe("hello");
  });

  it("skips existing files and overwrites them only with force", () => {
    const src = scratch("docs-src-");
    write(src, "README.md", "new");
    const dest = join(scratch(), "docs");
    write(dest, "README.md", "old");

    const first = importProjectDocs(src, dest);
    expect(first.skipped.map((e) => e.path)).toEqual(["README.md"]);
    expect(read(dest, "README.md")).toBe("old");

    const forced = importProjectDocs(src, dest, { force: true });
    expect(forced.overwritten.map((e) => e.path)).toEqual(["README.md"]);
    expect(read(dest, "README.md")).toBe("new");
  });

  it("reports the plan without writing in a dry run", () => {
    const src = scratch("docs-src-");
    write(src, "a.md", "a");
    const dest = join(scratch(), "docs");

    const result = importProjectDocs(src, dest, { dryRun: true });
    expect(result.created.map((e) => e.path)).toEqual(["a.md"]);
    expect(existsSync(join(dest, "a.md"))).toBe(false);
  });

  it("ignores macOS junk files and folders", () => {
    const src = scratch("docs-src-");
    write(src, "real.md", "real");
    write(src, "__MACOSX/._real.md", "junk");
    write(src, ".DS_Store", "junk");
    write(src, "._real.md", "junk");

    const dest = join(scratch(), "docs");
    const result = importProjectDocs(src, dest);
    expect(result.created.map((e) => e.path)).toEqual(["real.md"]);
  });

  it("throws a clear error when the source does not exist", () => {
    expect(() => importProjectDocs("/no/such/docs/here", join(scratch(), "docs"))).toThrow(
      /source not found/,
    );
  });
});

describe("importProjectDocs — zip archives", () => {
  it("unwraps a single top-level folder", () => {
    const staging = scratch("zip-src-");
    write(staging, "project-docs/README.md", "# Index");
    write(staging, "project-docs/architecture.md", "# Arch");
    const zipPath = join(scratch(), "docs.zip");
    zipUp(staging, zipPath);

    const dest = join(scratch(), "docs");
    const result = importProjectDocs(zipPath, dest);
    expect(result.created.map((e) => e.path).sort()).toEqual(["README.md", "architecture.md"]);
    expect(result.note).toMatch(/unwrapped single top-level folder/);
    expect(existsSync(join(dest, "README.md"))).toBe(true);
  });

  it("imports files sitting at the archive root", () => {
    const staging = scratch("zip-src-");
    write(staging, "README.md", "# Index");
    write(staging, "glossary.md", "# Gloss");
    const zipPath = join(scratch(), "docs.zip");
    zipUp(staging, zipPath);

    const dest = join(scratch(), "docs");
    const result = importProjectDocs(zipPath, dest);
    expect(result.created.map((e) => e.path).sort()).toEqual(["README.md", "glossary.md"]);
  });

  it("imports a single loose file at the archive root", () => {
    const staging = scratch("zip-src-");
    write(staging, "only.md", "only");
    const zipPath = join(scratch(), "docs.zip");
    zipUp(staging, zipPath);

    const dest = join(scratch(), "docs");
    const result = importProjectDocs(zipPath, dest);
    // A lone file is not a directory, so it lands at the docs root unwrapped.
    expect(result.created.map((e) => e.path)).toEqual(["only.md"]);
  });

  it("ignores __MACOSX when deciding the single top-level folder", () => {
    const staging = scratch("zip-src-");
    write(staging, "docs/README.md", "# Index");
    write(staging, "__MACOSX/._README.md", "junk");
    const zipPath = join(scratch(), "docs.zip");
    zipUp(staging, zipPath);

    const dest = join(scratch(), "docs");
    const result = importProjectDocs(zipPath, dest);
    expect(result.created.map((e) => e.path)).toEqual(["README.md"]);
  });

  it("rejects a corrupt archive with a clear error", () => {
    const bad = join(scratch(), "broken.zip");
    writeFileSync(bad, "this is not a zip file at all");
    expect(() => importProjectDocs(bad, join(scratch(), "docs"))).toThrow(/readable zip/);
  });

  it("rejects a zip-slip path traversal entry", () => {
    // Hand-build a minimal zip whose stored name escapes the extraction dir.
    const zipPath = join(scratch(), "slip.zip");
    writeFileSync(zipPath, buildStoredZip([{ name: "../evil.md", content: "pwned" }]));
    expect(() => importProjectDocs(zipPath, join(scratch(), "docs"))).toThrow(
      /escapes the archive/,
    );
  });

  it("refuses an archive containing a symlink", () => {
    const staging = scratch("zip-src-");
    mkdirSync(join(staging, "docs"), { recursive: true });
    write(staging, "docs/real.md", "real");
    symlinkSync("/etc/hosts", join(staging, "docs/link.md"));
    const zipPath = join(scratch(), "link.zip");
    // `zip -y` stores symlinks as links rather than following them.
    const r = spawnSync("zip", ["-qry", zipPath, "."], { cwd: staging, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`zip failed: ${r.stderr || r.error?.message}`);
    expect(() => importProjectDocs(zipPath, join(scratch(), "docs"))).toThrow(/symlink/);
  });
});

describe("scaffoldStarterDocs", () => {
  it("writes the five starter files and never overwrites", () => {
    const docs = join(scratch(), "docs");
    const first = scaffoldStarterDocs(docs);
    expect(first.created.sort()).toEqual([
      "README.md",
      "architecture.md",
      "conventions.md",
      "glossary.md",
      "product.md",
    ]);

    write(docs, "README.md", "# Mine");
    const second = scaffoldStarterDocs(docs);
    expect(second.created).toEqual([]);
    expect(second.skipped.length).toBe(5);
    expect(read(docs, "README.md")).toBe("# Mine");
  });

  it("index README links every sibling so the doctor check passes out of the box", () => {
    const docs = join(scratch(), "docs");
    scaffoldStarterDocs(docs);
    const readme = read(docs, "README.md");
    for (const sibling of ["product.md", "architecture.md", "conventions.md", "glossary.md"]) {
      expect(readme).toContain(`./${sibling}`);
    }
    expect(readme).toMatch(/reading order/i);
    expect(readme).toMatch(/if you learn something durable, write it here/i);
  });

  it("keeps prompts, not fake content, in each stub", () => {
    const docs = join(scratch(), "docs");
    scaffoldStarterDocs(docs);
    expect(Object.keys(STARTER_DOCS).length).toBe(5);
    expect(read(docs, "product.md")).toMatch(/what is this project/i);
  });
});

describe("checkDocsWiring", () => {
  const indexText = "# Index\n\n- [product](./product.md)\n- [glossary](./glossary.md)\n";

  it("passes when AGENTS.md points at the index and docs are linked", () => {
    const findings = checkDocsWiring({
      docsDir: "docs",
      agentsMd: "Read docs/README.md first.",
      docsFiles: ["README.md", "product.md", "glossary.md"],
      taskCount: 3,
      indexText,
    });
    expect(findings.map((f) => f.id)).toEqual(["layout.docs-wiring"]);
    expect(findings[0].level).toBe("pass");
  });

  it("warns (a) when AGENTS.md does not mention the docs index", () => {
    const findings = checkDocsWiring({
      docsDir: "docs",
      agentsMd: "Some AGENTS.md with no docs pointer.",
      docsFiles: ["README.md", "product.md", "glossary.md"],
      taskCount: 1,
      indexText,
    });
    expect(findings.map((f) => f.id)).toContain("layout.docs-index-unlinked");
    expect(findings.every((f) => f.level === "warn")).toBe(true);
  });

  it("warns (b) when a doc is not linked from the index", () => {
    const findings = checkDocsWiring({
      docsDir: "docs",
      agentsMd: "See docs/README.md.",
      docsFiles: ["README.md", "product.md", "glossary.md", "orphan.md"],
      taskCount: 1,
      indexText,
    });
    const orphan = findings.find((f) => f.id === "layout.docs-orphaned");
    expect(orphan?.level).toBe("warn");
    expect(orphan?.detail).toContain("orphan.md");
    expect(orphan?.fix).toBeTruthy();
  });

  it("warns (c) when the docs dir is empty while tasks exist", () => {
    const findings = checkDocsWiring({
      docsDir: "docs",
      agentsMd: "See docs/README.md.",
      docsFiles: [],
      taskCount: 5,
    });
    expect(findings.map((f) => f.id)).toEqual(["layout.docs-empty"]);
    expect(findings[0].fix).toBeTruthy();
  });

  it("does not warn (c) when there are no tasks", () => {
    const findings = checkDocsWiring({
      docsDir: "docs",
      agentsMd: "See docs/README.md.",
      docsFiles: [],
      taskCount: 0,
    });
    expect(findings.map((f) => f.id)).toEqual(["layout.docs-wiring"]);
    expect(findings[0].level).toBe("pass");
  });

  it("honours a namespaced docsDir when checking the AGENTS.md link", () => {
    const findings = checkDocsWiring({
      docsDir: "repoos/docs",
      agentsMd: "See repoos/docs/README.md.",
      docsFiles: ["README.md", "product.md"],
      taskCount: 1,
      indexText: "- [product](./product.md)",
    });
    expect(findings.map((f) => f.id)).toEqual(["layout.docs-wiring"]);
  });
});

describe("isZipSource", () => {
  it("detects zip extensions case-insensitively", () => {
    expect(isZipSource("/tmp/docs.zip")).toBe(true);
    expect(isZipSource("/tmp/Docs.ZIP")).toBe(true);
    expect(isZipSource("/tmp/docs")).toBe(false);
  });
});

/**
 * Minimal STORED (uncompressed) zip builder for the zip-slip test — a real
 * archive tool would refuse to create a traversal entry, but a hostile zip can
 * contain one, which is exactly the input we must reject.
 */
function buildStoredZip(entries: { name: string; content: string }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed
    local.writeUInt32LE(data.length, 22); // uncompressed
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuf, end]);
}

/** CRC-32 (zip's polynomial), only needed by the hand-built archive above. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
