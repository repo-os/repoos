/**
 * Synchronous HTTP transport tests (#0660).
 *
 * The transport is the bridge that lets the synchronous storage-provider
 * interface (#0658) talk to a remote S3 endpoint: it runs the request in a
 * child process and blocks the caller until the response is printed back. These
 * tests exercise it against a real loopback server started in its own child
 * process — the server must be separate, because the parent is blocked in
 * `spawnSync` while the request is in flight and could not answer its own
 * request (the real target, Neon, is remote). No test reaches the public
 * internet.
 */
import { describe, expect, it, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { syncHttpRequest } from "./sync-http.js";

const SERVERS: ChildProcess[] = [];
afterEach(() => {
  for (const server of SERVERS.splice(0)) server.kill();
});

/** Start a loopback HTTP server in a child process; resolve its base URL. */
function startServer(): Promise<string> {
  const source = `
const { createServer } = require("node:http");
const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    if (req.url.startsWith("/echo")) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.concat(chunks));
    } else if (req.url.startsWith("/missing")) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("nope");
    } else if (req.url.startsWith("/meta")) {
      res.writeHead(200, { "x-custom": "yes" });
      res.end("ROOT");
    } else {
      res.writeHead(200, {});
      res.end("");
    }
  });
});
server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port)));
`;
  const child = spawn(process.execPath, ["--eval", source], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  SERVERS.push(child);
  return new Promise((resolve, reject) => {
    let out = "";
    child.stdout?.on("data", (chunk) => {
      out += chunk.toString();
      if (/^\d+$/.test(out.trim())) resolve(`http://127.0.0.1:${out.trim()}`);
    });
    child.on("error", reject);
  });
}

describe("syncHttpRequest — the synchronous bridge", () => {
  it("performs a GET and returns status, headers and body", async () => {
    const base = await startServer();
    const res = syncHttpRequest({ method: "GET", url: `${base}/meta`, headers: {} });
    expect(res.status).toBe(200);
    expect(res.headers["x-custom"]).toBe("yes");
    expect(res.body.toString()).toBe("ROOT");
  });

  it("sends a request body and reads the echoed bytes back", async () => {
    const base = await startServer();
    const payload = Buffer.from("attachment-bytes-\u0000\u00ff", "utf8");
    const res = syncHttpRequest({
      method: "POST",
      url: `${base}/echo`,
      headers: {},
      body: payload,
    });
    expect(res.status).toBe(200);
    expect(res.body.equals(payload)).toBe(true);
  });

  it("returns a 404 status rather than throwing", async () => {
    const base = await startServer();
    expect(syncHttpRequest({ method: "GET", url: `${base}/missing`, headers: {} }).status).toBe(
      404,
    );
  });

  it("throws on a connection failure, which the provider turns into a miss", () => {
    expect(() =>
      syncHttpRequest({ method: "GET", url: "http://127.0.0.1:9/x", headers: {} }),
    ).toThrow();
  });
});
