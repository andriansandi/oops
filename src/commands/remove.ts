import * as p from "@clack/prompts";
import { removeInstance } from "../core/config.ts";

export async function cmdRemove(nameOrId: string | undefined): Promise<void> {
  if (!nameOrId) {
    p.log.error("Usage: oops remove <name>");
    process.exit(1);
  }
  const ok = await p.confirm({
    message: `Permanently remove instance "${nameOrId}" from local config?`,
  });
  if (p.isCancel(ok) || !ok) {
    p.log.info("Cancelled.");
    return;
  }
  const removed = removeInstance(nameOrId);
  if (!removed) {
    p.log.error(`Instance "${nameOrId}" not found.`);
    process.exit(1);
  }
  p.log.success("Removed.");
}
