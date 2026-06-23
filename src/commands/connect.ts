import * as p from "@clack/prompts";
import {
  addInstance,
  ensureConfig,
  FREE_INSTANCE_LIMIT,
  type D1Credentials,
} from "../core/config.ts";
import { buildAdaptor } from "../core/adaptor-factory.ts";
import { maskSecret } from "../ui/render.ts";

export async function cmdConnect(): Promise<void> {
  const cfg = ensureConfig();

  if (cfg.license === "free" && cfg.instances.length >= FREE_INSTANCE_LIMIT) {
    p.log.error(
      `Free tier limit reached (${FREE_INSTANCE_LIMIT} instances). Run \`oops upgrade\`.`,
    );
    process.exit(1);
  }

  p.intro("Add a Cloudflare D1 instance");

  const name = await p.text({
    message: "Instance name (used as a label)",
    placeholder: "my-prod-db",
    validate: (v) =>
      !v || !v.trim() ? "Name is required" : v.length > 64 ? "Max 64 chars" : undefined,
  });
  if (p.isCancel(name)) return p.cancel("Cancelled.");

  const accountId = await p.text({
    message: "Cloudflare Account ID",
    placeholder: "32 hex chars",
    validate: (v) =>
      !v || !/^[a-f0-9]{32}$/i.test(v.trim())
        ? "Must be a 32-character hex Account ID"
        : undefined,
  });
  if (p.isCancel(accountId)) return p.cancel("Cancelled.");

  const databaseId = await p.text({
    message: "D1 Database ID",
    placeholder: "UUID (32 hex with dashes)",
    validate: (v) =>
      !v || !/^[a-f0-9-]{32,36}$/i.test(v.trim())
        ? "Must be a valid D1 database UUID"
        : undefined,
  });
  if (p.isCancel(databaseId)) return p.cancel("Cancelled.");

  const apiToken = await p.password({
    message: "Cloudflare API Token (needs D1 read/write scope)",
    validate: (v) => (!v || v.length < 10 ? "Token looks too short" : undefined),
  });
  if (p.isCancel(apiToken)) return p.cancel("Cancelled.");

  const creds: D1Credentials = {
    accountId: (accountId as string).trim(),
    databaseId: (databaseId as string).trim(),
    apiToken: apiToken as string,
  };

  const spin = p.spinner();
  spin.start("Verifying connection to Cloudflare D1…");
  const adaptor = buildAdaptor({
    id: "preview",
    name: name as string,
    type: "d1",
    credentials: creds,
    createdAt: new Date().toISOString(),
  });
  let ok = false;
  try {
    ok = await adaptor.testConnection();
  } catch (err) {
    spin.stop("Connection failed");
    p.log.error((err as Error).message);
    process.exit(1);
  }
  if (!ok) {
    spin.stop("Connection failed");
    p.log.error("Cloudflare rejected the credentials.");
    process.exit(1);
  }
  spin.stop("Connection verified ✓");

  const inst = addInstance({
    name: name as string,
    type: "d1",
    credentials: creds,
  });

  p.log.success(`Saved instance "${inst.name}" (id: ${inst.id.slice(0, 8)}…)`);
  p.log.info(
    `Token stored as ${maskSecret(creds.apiToken)} in ~/.config/oops/config.json (chmod 600).`,
  );
  p.outro("Use `oops tables` to introspect the database.");
}
