import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, [path.join(root, "dist", "mcp.js")], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
});

let out = "";
let err = "";
child.stdout.on("data", (b) => {
  out += b.toString("utf8");
});
child.stderr.on("data", (b) => {
  err += b.toString("utf8");
});

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "knock-probe", version: "0" },
  },
};

child.stdin.write(JSON.stringify(init) + "\n");

const deadline = Date.now() + 15000;
const timer = setInterval(() => {
  if (out.includes('"id":1') || Date.now() > deadline) {
    clearInterval(timer);
    child.kill("SIGTERM");
    const lines = out.split(/\r?\n/).filter(Boolean);
    let parsed = 0;
    let bad = 0;
    for (const line of lines) {
      try {
        JSON.parse(line);
        parsed += 1;
      } catch {
        bad += 1;
      }
    }
    console.log(
      JSON.stringify(
        {
          ok: parsed > 0 && bad === 0,
          stdout_lines: lines.length,
          parsed,
          bad,
          stderr_bytes: err.length,
          first_stdout: lines[0] ? lines[0].slice(0, 180) : "",
        },
        null,
        2,
      ),
    );
    process.exit(parsed > 0 && bad === 0 ? 0 : 1);
  }
}, 100);
