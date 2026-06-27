import * as p from "@clack/prompts";
import { ensureConfig, setActiveInstance, instanceHint } from "../core/config.ts";

export async function cmdUse(nameOrId: string | undefined): Promise<void> {
  const cfg = ensureConfig();
  if (cfg.instances.length === 0) {
    p.log.warn("No instances. Run `oops connect` first.");
    return;
  }
  let target = nameOrId;
  if (!target) {
    const choice = await p.select({
      message: "Switch active instance",
      options: cfg.instances.map((i) => ({
        value: i.name,
        label: i.name,
        hint: instanceHint(i),
      })),
    });
    if (p.isCancel(choice)) return p.cancel("Cancelled.");
    target = choice as string;
  }
  const inst = setActiveInstance(target);
  p.log.success(`Active instance → ${inst.name}`);
}
