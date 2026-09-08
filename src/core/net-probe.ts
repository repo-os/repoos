/** Tiny TCP reachability probe — used to answer "is anything listening on this local port?" */
import { connect } from "node:net";

/** True if a TCP connection to `127.0.0.1:port` succeeds within `timeoutMs`. */
export function portListening(port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

/** Extract the port from a `http://localhost:PORT` style origin, or null if unparseable. */
export function originPort(service: string): number | null {
  const m = service.match(/:(\d+)(?:\/|$)/);
  return m ? Number(m[1]) : null;
}
