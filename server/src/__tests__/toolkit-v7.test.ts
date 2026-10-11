import { describe, it, expect } from "vitest";
import {
  loadToolkitCatalog,
  listToolkitTools,
  resolveToolkitUrl,
  toolkitStats,
  getToolkitTool,
} from "../modules/toolkit-catalog.js";
import { classifyIndicator, classifyIndicators } from "../modules/indicator-classify.js";
import {
  buildToolkitPackFromIndicator,
  buildToolkitPackFromSubject,
  resolveSingleToolkitTool,
} from "../modules/toolkit-resolve.js";
import { redactText, restoreText, redactionMapToCsv, parseRedactionMapCsv } from "../modules/redactor.js";
import { analyzeIban } from "../modules/iban-intel.js";

describe("toolkit-catalog", () => {
  it("loads 800+ tools from Exploratores-inspired catalog", () => {
    const cat = loadToolkitCatalog();
    expect(cat.toolCount).toBeGreaterThanOrEqual(800);
    expect(cat.tools.length).toBe(cat.toolCount);
    expect(cat.categories.length).toBeGreaterThan(10);
  });

  it("filters by category and resolves URL templates", () => {
    const domains = listToolkitTools({ category: "domains", limit: 5 });
    expect(domains.length).toBeGreaterThan(0);
    const tool = domains[0]!;
    const res = resolveToolkitUrl(tool, { domain: "example.com" });
    expect("url" in res).toBe(true);
    if ("url" in res) {
      expect(res.url).toContain("example.com");
      expect(res.missing.filter((m) => m === "domain")).toHaveLength(0);
    }
  });

  it("exposes stats and known search engine tools", () => {
    const stats = toolkitStats();
    expect(stats.toolCount).toBeGreaterThan(800);
    expect(stats.groups).toContain("identity");
    const google = getToolkitTool("searchengines-google");
    expect(google?.urlTemplate).toContain("google.com");
  });
});

describe("indicator-classify", () => {
  it("classifies email, domain, username, phone", () => {
    expect(classifyIndicator("alice@example.com").kind).toBe("email");
    expect(classifyIndicator("example.com").kind).toBe("domain");
    expect(classifyIndicator("@johndoe").kind).toBe("username");
    expect(classifyIndicator("+1 555-123-4567").kind).toBe("phone");
  });

  it("classifies multi-line batches", () => {
    const list = classifyIndicators("bob@test.com\n192.168.1.1\nJane Doe");
    expect(list.map((x) => x.kind)).toEqual(expect.arrayContaining(["email", "ip", "name"]));
  });
});

describe("toolkit-resolve packs", () => {
  it("builds pack from subject with ready links", () => {
    const pack = buildToolkitPackFromSubject(
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        username: "janedoe",
        website: "example.com",
      },
      { maxTotal: 40 },
    );
    expect(pack.linkCount).toBeGreaterThan(5);
    expect(pack.readyCount).toBeGreaterThan(0);
    expect(pack.links.some((l) => l.url.includes("example.com") || l.url.includes("Jane"))).toBe(true);
  });

  it("builds pack from freeform indicator", () => {
    const pack = buildToolkitPackFromIndicator("targetcorp.io", { maxLinks: 20 });
    expect(pack.indicatorSummary[0]?.kind).toBe("domain");
    expect(pack.links.length).toBeGreaterThan(0);
  });

  it("resolves single tool", () => {
    const r = resolveSingleToolkitTool("searchengines-google", { term: "osint" });
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.ready).toBe(true);
      expect(r.url).toContain("osint");
    }
  });
});

describe("redactor", () => {
  it("redacts and restores PII with map", () => {
    const input =
      "Contact Alice Smith at alice@example.com or +1-555-010-9999. Profile https://github.com/alice.";
    const result = redactText(input, { names: ["Alice Smith"] });
    expect(result.redacted).not.toContain("alice@example.com");
    expect(result.redacted).toContain("[EMAIL_");
    expect(result.map.length).toBeGreaterThan(0);
    const restored = restoreText(result.redacted, result.map);
    expect(restored).toContain("alice@example.com");
    expect(restored).toContain("Alice Smith");
    const csv = redactionMapToCsv(result.map);
    expect(parseRedactionMapCsv(csv).length).toBe(result.map.length);
  });
});

describe("iban-intel", () => {
  it("validates a known-good GB IBAN structure via mod-97", () => {
    // Public test IBAN (GB82 WEST 1234 5698 7654 32)
    const r = analyzeIban("GB82WEST12345698765432");
    expect(r.countryCode).toBe("GB");
    expect(r.isValid).toBe(true);
    expect(r.searchLinks.length).toBeGreaterThan(0);
  });

  it("rejects checksum failures", () => {
    const r = analyzeIban("GB00WEST12345698765432");
    expect(r.isValid).toBe(false);
  });
});
