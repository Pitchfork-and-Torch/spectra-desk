/**
 * electron-builder excludes node_modules from extraResources by default.
 * Copy production server deps into the packaged app after pack.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

exports.default = async function afterPack(context) {
  const desktopDir = path.join(__dirname, "..");
  const srcNm = path.join(desktopDir, "resources", "server", "node_modules");
  const destServer = path.join(context.appOutDir, "resources", "server");
  const destNm = path.join(destServer, "node_modules");

  if (!fs.existsSync(srcNm)) {
    console.error("[afterPack] ERROR: staging node_modules missing at", srcNm);
    process.exitCode = 1;
    return;
  }

  console.log("[afterPack] copying server node_modules →", destNm);
  await fsp.mkdir(destServer, { recursive: true });
  await fsp.rm(destNm, { recursive: true, force: true });
  await fsp.cp(srcNm, destNm, { recursive: true, force: true });

  const required = [
    path.join(destNm, "@hono", "node-server"),
    path.join(destNm, "hono"),
    path.join(destNm, "zod"),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      console.error("[afterPack] ERROR: missing required package after copy:", p);
      process.exitCode = 1;
      return;
    }
  }
  console.log("[afterPack] server dependencies OK (@hono/node-server, hono, zod)");
};
