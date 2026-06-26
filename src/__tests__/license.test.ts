import { describe, expect, it } from "bun:test";
import {
  LICENSE_VERIFY_URL,
  parseLicenseResponse,
  resolveVerifyUrl,
  verifyLicenseOnline,
} from "../core/license.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseLicenseResponse", () => {
  it("accepts a valid pro response", () => {
    expect(parseLicenseResponse({ valid: true, tier: "pro" })).toEqual({
      valid: true,
      tier: "pro",
    });
  });

  it("accepts a valid enterprise response", () => {
    expect(parseLicenseResponse({ valid: true, tier: "enterprise" })).toEqual({
      valid: true,
      tier: "enterprise",
    });
  });

  it("rejects when valid is false, surfacing the reason", () => {
    const r = parseLicenseResponse({ valid: false, reason: "expired" });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("uses a default reason when valid is false without one", () => {
    const r = parseLicenseResponse({ valid: false });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("License key rejected");
  });

  it("rejects a valid response with an unknown tier", () => {
    const r = parseLicenseResponse({ valid: true, tier: "mega" });
    expect(r.valid).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(parseLicenseResponse(null).valid).toBe(false);
    expect(parseLicenseResponse("nope").valid).toBe(false);
    expect(parseLicenseResponse(42).valid).toBe(false);
  });
});

describe("resolveVerifyUrl", () => {
  it("defaults to the production URL", () => {
    const prev = process.env.OOPS_LICENSE_URL;
    delete process.env.OOPS_LICENSE_URL;
    expect(resolveVerifyUrl()).toBe(LICENSE_VERIFY_URL);
    process.env.OOPS_LICENSE_URL = prev;
  });

  it("honors an explicit override", () => {
    expect(resolveVerifyUrl("https://staging.example.com/v")).toBe(
      "https://staging.example.com/v",
    );
  });

  it("honors the env var when no override is given", () => {
    const prev = process.env.OOPS_LICENSE_URL;
    process.env.OOPS_LICENSE_URL = "https://env.example.com/v";
    expect(resolveVerifyUrl()).toBe("https://env.example.com/v");
    process.env.OOPS_LICENSE_URL = prev;
  });
});

describe("verifyLicenseOnline", () => {
  it("returns the tier on a 200 valid response", async () => {
    const fetchImpl = async () => jsonResponse({ valid: true, tier: "pro" });
    const r = await verifyLicenseOnline("key-1", { fetchImpl });
    expect(r).toEqual({ valid: true, tier: "pro" });
  });

  it("returns invalid on a 200 rejected response", async () => {
    const fetchImpl = async () =>
      jsonResponse({ valid: false, reason: "no such key" });
    const r = await verifyLicenseOnline("bad", { fetchImpl });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("no such key");
  });

  it("returns unavailable on a network error (no throw)", async () => {
    const fetchImpl = async () => {
      throw new Error("ENOTFOUND");
    };
    const r = await verifyLicenseOnline("key", { fetchImpl });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("unavailable");
  });

  it("returns unavailable on a timeout", async () => {
    const fetchImpl = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("The operation was aborted")),
          { once: true },
        );
      });
    const r = await verifyLicenseOnline("key", {
      fetchImpl,
      timeoutMs: 20,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("unavailable");
  });

  it("posts the key as JSON to the resolved URL", async () => {
    let captured: { url: string; body: string } | null = null;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      captured = { url, body: String(init?.body) };
      return jsonResponse({ valid: true, tier: "enterprise" });
    };
    await verifyLicenseOnline("key-9", {
      fetchImpl,
      url: "https://test.example.com/v",
    });
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://test.example.com/v");
    expect(JSON.parse(captured!.body)).toEqual({ key: "key-9" });
  });

  it("handles a non-JSON response body gracefully", async () => {
    const fetchImpl = async () =>
      new Response("<html>not json</html>", { status: 502 });
    const r = await verifyLicenseOnline("key", { fetchImpl });
    expect(r.valid).toBe(false);
  });
});
