import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance, FREE_INSTANCE_LIMIT, instanceHint } from "../core/config.ts";
import { c } from "../ui/render.ts";

export async function cmdStatus(): Promise<void> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);

  const lines: string[] = [];
  lines.push(`${c.dim}config:${c.reset}  ~/.config/oops/config.json`);
  lines.push(
    `${c.dim}license:${c.reset} ${cfg.license === "free" ? `${c.yellow}free${c.reset}` : c.green + cfg.license + c.reset}`,
  );
  lines.push(
    `${c.dim}instances:${c.reset} ${cfg.instances.length}${cfg.license === "free" ? ` / ${FREE_INSTANCE_LIMIT}` : ""}`,
  );
  lines.push(
    `${c.dim}active:${c.reset}    ${
      active
        ? `${c.green}${active.name}${c.reset}  ${c.dim}[${active.type} • ${instanceHint(active)}]${c.reset}`
        : `${c.dim}(none)${c.reset}`
    }`,
  );
  p.note(lines.join("\n"), "oops status");
}
