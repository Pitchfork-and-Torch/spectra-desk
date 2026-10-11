import { describe, expect, it } from "vitest";
import net from "node:net";
import { isPortFree, pickFreePort } from "../lib/free-port.js";

function listen(port: number, host = "127.0.0.1"): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(port, host, () => resolve(srv));
  });
}

describe("pickFreePort", () => {
  it("returns the preferred port when it is free", async () => {
    const port = await pickFreePort(39111, "127.0.0.1", 5);
    expect(port).toBeGreaterThanOrEqual(39111);
    expect(await isPortFree(port)).toBe(true);
  });

  it("skips a bound port", async () => {
    const hold = await listen(0);
    const addr = hold.address();
    if (!addr || typeof addr === "string") {
      hold.close();
      throw new Error("expected TCP address");
    }
    const busy = addr.port;
    try {
      const picked = await pickFreePort(busy, "127.0.0.1", 8);
      expect(picked).not.toBe(busy);
      expect(await isPortFree(picked)).toBe(true);
    } finally {
      await new Promise<void>((r) => hold.close(() => r()));
    }
  });
});
