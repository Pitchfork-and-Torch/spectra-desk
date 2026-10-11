import { describe, expect, it } from "vitest";
import { fuseSignals } from "../modules/signal-fusion.js";
import { ANCHOR_DOMAIN } from "./test-subjects.js";

describe("signal-fusion", () => {
  it("fuses github blog and domain anchors", () => {
    const fused = fuseSignals(
      { firstName: "John", lastName: "Doe", employer: ANCHOR_DOMAIN },
      [
        {
          title: "John Doe musician",
          url: `https://${ANCHOR_DOMAIN}`,
          snippet: "folk",
          source: "t",
          query: "q",
          classification: "corroborated",
        },
      ],
      {
        login: "user",
        name: "John Doe",
        bio: null,
        blog: ANCHOR_DOMAIN,
        location: "Springfield, IL",
        company: null,
        publicRepos: 1,
        url: "https://github.com/user",
      },
      {
        domain: ANCHOR_DOMAIN,
        url: `https://${ANCHOR_DOMAIN}`,
        siteTitle: "John Doe - Folk Singer-Songwriter",
      },
    );
    expect(fused.boosts.length + fused.fusedFacts.length).toBeGreaterThan(0);
  });
});