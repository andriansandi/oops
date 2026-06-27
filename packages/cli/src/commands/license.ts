import * as p from "@clack/prompts";
import { ensureConfig, saveConfig } from "../core/config.ts";
import { verifyLicenseOnline } from "../core/license.ts";
import { c } from "../ui/render.ts";

export async function cmdLicense(key: string | undefined): Promise<void> {
  p.intro("Redeem a license key");

  const licenseKey =
    key ??
    (await p.password({
      message: "License key",
      validate: (v) => (!v || v.trim().length < 4 ? "Enter your license key" : undefined),
    }));
  if (p.isCancel(licenseKey)) return p.cancel("Cancelled.");

  const spin = p.spinner();
  spin.start("Verifying license…");
  const result = await verifyLicenseOnline(String(licenseKey).trim());
  spin.stop("Done");

  if (result.valid && result.tier) {
    const cfg = ensureConfig();
    cfg.license = result.tier;
    saveConfig(cfg);
    p.log.success(
      `License activated — you're now on ${c.green}${result.tier}${c.reset}.`,
    );
    p.outro("Instance limits unlocked. Run `oops status` to confirm.");
    return;
  }

  if (result.reason && /unavailable/i.test(result.reason)) {
    p.log.warn(
      `${c.yellow}License validation service is not yet available.${c.reset}\n` +
        `Please try again later, or contact support@oops.cloud.\n` +
        `(${result.reason})`,
    );
  } else {
    p.log.error(result.reason ?? "License key rejected.");
  }
  process.exit(1);
}
