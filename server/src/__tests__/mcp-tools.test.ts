import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPECTRA_ENGINE_VERSION } from "../engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpSource = readFileSync(path.join(__dirname, "../mcp.ts"), "utf8");

describe("MCP v5 surface", () => {
  it("uses engine version for MCP server version", () => {
    expect(SPECTRA_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(mcpSource).toContain("SPECTRA_ENGINE_VERSION");
  });

  it("registers core, v6 dossier, and v7 toolkit tools", () => {
    const required = [
      "investigate_subject",
      "correlate_username",
      "get_report",
      "list_reports",
      "refine_disambiguation",
      "confirm_identity",
      "assign_portraits",
      "get_dossier",
      "save_dossier_notes",
      "subject_history",
      "discover_monikers",
      "enrich_profile",
      "get_identity_lock",
      "reverse_image_search",
      "filter_portraits",
      "public_record_dorks",
      "get_moniker_inventory",
      "get_deep_profiles",
      "get_reverse_image_pack",
      "list_toolkit_tools",
      "toolkit_pack",
      "resolve_toolkit_url",
      "classify_indicator",
      "redact_pii",
      "restore_pii",
      "analyze_iban",
      "get_toolkit_pack",
    ];
    for (const name of required) {
      expect(mcpSource).toContain(`"${name}"`);
    }
  });

  it("describes v6/v7 pipeline capabilities", () => {
    expect(mcpSource).toMatch(/identity workbench|identity lock/i);
    expect(mcpSource).toMatch(/subject dossier|dossier engine/i);
    expect(mcpSource).toMatch(/moniker|reverse-image|portrait/i);
    expect(mcpSource).toMatch(/toolkit|redact|iban/i);
  });
});
