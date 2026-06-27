import * as p from "@clack/prompts";
import { c } from "../ui/render.ts";

export async function cmdUpgrade(): Promise<void> {
  p.intro("Upgrade to Oops Pro");
  p.note(
    [
      `Free tier limits you to ${c.yellow}5 instances${c.reset} on the CLI.`,
      "",
      `${c.bold}Pro${c.reset}   — unlimited CLI instances, Neon adaptor unlocked.`,
      `${c.bold}Cloud${c.reset} — team workspaces, audit log, automated backups.`,
      "",
      `License key redemption: ${c.cyan}oops license <key>${c.reset}`,
      `Cloud dashboard:        ${c.cyan}https://oops.cloud${c.reset}`,
    ].join("\n"),
    "Why upgrade?",
  );
  p.outro("Visit https://oops.cloud to get a license key.");
}
