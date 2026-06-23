import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { c } from "../ui/render.ts";

export async function cmdList(): Promise<void> {
  const cfg = ensureConfig();
  if (cfg.instances.length === 0) {
    p.log.warn("No instances configured. Run `oops connect` to add one.");
    return;
  }

  const active = getActiveInstance(cfg);

  const lines: string[] = [];
  lines.push(
    `${c.bold}Configured instances (${cfg.instances.length}/${cfg.license === "free" ? 5 : "∞"})${c.reset}`,
  );
  lines.push("");
  for (const inst of cfg.instances) {
    const isActive = inst.id === active?.id;
    const marker = isActive ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
    const label = isActive ? `${c.bold}${inst.name}${c.reset}` : inst.name;
    const db = `${c.dim}${inst.credentials.databaseId.slice(0, 8)}…${c.reset}`;
    const type = `${c.cyan}[${inst.type}]${c.reset}`;
    lines.push(`  ${marker} ${label}  ${type}  ${db}`);
  }

  p.note(lines.join("\n"), "oops");
}
