import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, withBaseUrl } from "../../skeleton/src/lib/links";

describe("normalizeBaseUrl", () => {
  it("normalizes empty and slash base values", () => {
    expect(normalizeBaseUrl(undefined)).toBe("/");
    expect(normalizeBaseUrl("")).toBe("/");
    expect(normalizeBaseUrl("/")).toBe("/");
  });

  it("normalizes project-page base values", () => {
    expect(normalizeBaseUrl("zoho-sdk")).toBe("/zoho-sdk/");
    expect(normalizeBaseUrl("/zoho-sdk")).toBe("/zoho-sdk/");
    expect(normalizeBaseUrl("/zoho-sdk/")).toBe("/zoho-sdk/");
  });
});

describe("withBaseUrl", () => {
  it("prefixes internal absolute paths for project-page bases", () => {
    expect(withBaseUrl("/zoho-sdk", "/crm/records")).toBe("/zoho-sdk/crm/records");
    expect(withBaseUrl("/zoho-sdk/", "/crm/records")).toBe("/zoho-sdk/crm/records");
  });

  it("prefixes internal relative paths for project-page bases", () => {
    expect(withBaseUrl("/zoho-sdk", "crm/records")).toBe("/zoho-sdk/crm/records");
    expect(withBaseUrl("/zoho-sdk", "./crm/records")).toBe("/zoho-sdk/crm/records");
  });

  it("preserves external, hash, and already-prefixed links", () => {
    expect(withBaseUrl("/zoho-sdk", "https://example.com/docs")).toBe("https://example.com/docs");
    expect(withBaseUrl("/zoho-sdk", "#section-1")).toBe("#section-1");
    expect(withBaseUrl("/zoho-sdk", "/zoho-sdk/crm/records")).toBe("/zoho-sdk/crm/records");
  });

  it("resolves root links to the base root", () => {
    expect(withBaseUrl("/zoho-sdk", "/")).toBe("/zoho-sdk/");
    expect(withBaseUrl("/zoho-sdk", "index")).toBe("/zoho-sdk/");
  });

  it("keeps root deployments unchanged", () => {
    expect(withBaseUrl("/", "/crm/records")).toBe("/crm/records");
    expect(withBaseUrl("/", "crm/records")).toBe("/crm/records");
  });
});
