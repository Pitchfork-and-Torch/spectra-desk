import net from "node:net";

export function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, host);
  });
}

export async function pickFreePort(
  preferred = 3847,
  host = "127.0.0.1",
  span = 32,
): Promise<number> {
  for (let i = 0; i < span; i++) {
    const port = preferred + i;
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`No free port in ${preferred}-${preferred + span - 1} on ${host}`);
}
