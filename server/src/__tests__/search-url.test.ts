import { describe, expect, it } from "vitest";
import { decodeBingUParam, unwrapSearchUrl } from "../modules/search-url.js";

describe("unwrapSearchUrl", () => {
  it("decodes Bing a1 base64 u= payload to LinkedIn", () => {
    const dest = "https://www.linkedin.com/in/satyanadella";
    const b64 = Buffer.from(dest, "utf8").toString("base64").replace(/=+$/, "");
    const bing = `https://www.bing.com/ck/a?!&&p=deadbeef&u=a1${b64}&ntb=1`;
    expect(unwrapSearchUrl(bing)).toBe(dest);
  });

  it("decodes Bing MMA/news destinations", () => {
    const dest = "https://www.sherdog.com/fighter/Dustin-Daprizio-123";
    const b64 = Buffer.from(dest, "utf8").toString("base64");
    expect(decodeBingUParam(`a1${b64}`)).toBe(dest);
    expect(unwrapSearchUrl(`https://www.bing.com/ck/a?u=a1${b64}`)).toBe(dest);
  });

  it("unwraps Google /url?q=", () => {
    const dest = "https://en.wikipedia.org/wiki/Barack_Obama";
    expect(unwrapSearchUrl(`https://www.google.com/url?q=${encodeURIComponent(dest)}&sa=U`)).toBe(dest);
  });

  it("leaves clean URLs unchanged", () => {
    expect(unwrapSearchUrl("https://github.com/octocat")).toBe("https://github.com/octocat");
  });
});
