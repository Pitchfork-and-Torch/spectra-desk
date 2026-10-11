import { existsSync } from "node:fs";
import { SPECTRA_VERSION } from "../version.js";
import { resolveFullChromiumExecutable } from "./playwright-launch.js";
import { toolkitStats } from "../modules/toolkit-catalog.js";

export const SPECTRA_HEALTH_FEATURES = [
  "website-profiler",
  "archive-timelooper",
  "log-odds-scoring",
  "persona-clusters",
  "twitch-discovery",
  "steam-resolver",
  "parallel-search",
  "chain-of-custody",
  "refine-requery",
  "cli",
  "mcp",
  "portrait-disambiguation",
  "subject-history",
  "identity-workbench",
  "candidate-profiles",
  "subject-dossier",
  "reference-photo",
  "media-timeline",
  "pdf-export",
  "toolkit-catalog",
  "toolkit-operator-pack",
  "pii-redactor",
  "iban-intel",
  "indicator-classify",
] as const;

export type SpectraHealth = {
  ok: true;
  service: "spectra-desk";
  version: string;
  desktop: boolean;
  chromiumOk: boolean;
  chromiumPath: string | null;
  toolkitCount: number;
  features: string[];
};

export function getHealthPayload(): SpectraHealth {
  let chromiumPath: string | null = null;
  let chromiumOk = false;
  try {
    chromiumPath = resolveFullChromiumExecutable();
    chromiumOk = Boolean(
      chromiumPath &&
        existsSync(chromiumPath) &&
        !/headless.?shell|chromium_headless_shell/i.test(chromiumPath),
    );
  } catch {
    chromiumOk = false;
    chromiumPath = null;
  }

  let toolkitCount = 0;
  try {
    toolkitCount = toolkitStats().toolCount;
  } catch {
    toolkitCount = 0;
  }

  return {
    ok: true,
    service: "spectra-desk",
    version: SPECTRA_VERSION,
    desktop: process.env.SPECTRA_DESKTOP === "1",
    chromiumOk,
    chromiumPath: chromiumOk ? chromiumPath : null,
    toolkitCount,
    features: [...SPECTRA_HEALTH_FEATURES],
  };
}
