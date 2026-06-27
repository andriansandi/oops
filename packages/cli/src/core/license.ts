import { QUERY_TIMEOUT_MS } from "@oops/core";

export const LICENSE_VERIFY_URL = "https://api.oops.cloud/v1/license/verify";

export type LicenseTier = "pro" | "enterprise";

export interface LicenseVerifyResult {
  valid: boolean;
  tier?: LicenseTier;
  reason?: string;
}

export function parseLicenseResponse(json: unknown): LicenseVerifyResult {
  if (typeof json !== "object" || json === null) {
    return { valid: false, reason: "Malformed response from license service" };
  }
  const obj = json as Record<string, unknown>;
  if (obj.valid !== true) {
    return {
      valid: false,
      reason: typeof obj.reason === "string" ? obj.reason : "License key rejected",
    };
  }
  const tier = obj.tier;
  if (tier !== "pro" && tier !== "enterprise") {
    return { valid: false, reason: "License service returned an unknown tier" };
  }
  return { valid: true, tier };
}

export type LicenseFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface VerifyOpts {
  url?: string;
  fetchImpl?: LicenseFetcher;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function resolveVerifyUrl(override?: string): string {
  const env = typeof process !== "undefined" ? process.env.OOPS_LICENSE_URL : undefined;
  return override ?? env ?? LICENSE_VERIFY_URL;
}

export async function verifyLicenseOnline(
  key: string,
  opts: VerifyOpts = {},
): Promise<LicenseVerifyResult> {
  const url = resolveVerifyUrl(opts.url);
  const timeoutMs = opts.timeoutMs ?? QUERY_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onExternalAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    return parseLicenseResponse(json);
  } catch (err) {
    return {
      valid: false,
      reason: `License validation service unavailable (${(err as Error).message})`,
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}
