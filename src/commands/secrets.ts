import { RepoOsApi } from "../cli/repoos-api.js";

async function secretInput(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks)
      .toString("utf8")
      .replace(/\r?\n$/, "");
  }
  process.stdout.write("Value (input hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return await new Promise((resolve, reject) => {
    let value = "";
    const done = (result: string) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(result);
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          process.stdin.setRawMode(false);
          reject(new Error("Cancelled"));
        } else if (char === "\r" || char === "\n") done(value);
        else if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

export async function cmdSecrets(args: string[]): Promise<number> {
  const [action, environment, key] = args;
  if (!action || !environment || !["list", "add", "replace", "delete"].includes(action)) {
    console.error(
      "Usage: repoos secrets <list|add|replace|delete> <environment> [KEY] (values come from stdin or a hidden prompt)",
    );
    return 2;
  }
  const api = new RepoOsApi();
  const path = `/api/project-environments/${encodeURIComponent(environment)}/secrets`;
  try {
    const metadata = (await api.requestOk("GET", path)) as {
      version: string;
      keys: Array<{
        name: string;
        status: string;
        source: string;
        visibility: string;
        version: string;
      }>;
    };
    if (action === "list") {
      for (const row of metadata.keys ?? [])
        console.log(`${row.name}\t${row.status}\t${row.visibility}\t${row.source}`);
      return 0;
    }
    if (!key) {
      console.error("A key name is required");
      return 2;
    }
    const row = metadata.keys.find((item) => item.name === key);
    if (action === "add" && row?.status === "set")
      throw new Error("Key already exists; use replace");
    if ((action === "replace" || action === "delete") && row?.status !== "set")
      throw new Error("Key is not set");
    const value = action === "delete" ? undefined : await secretInput();
    await api.requestOk("PUT", path, { action, key, value, version: metadata.version });
    console.log(`${action === "delete" ? "Removed" : "Saved"} ${key} in ${environment}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Secret operation failed");
    return 1;
  }
}
