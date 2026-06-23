#!/usr/bin/env bun
import { cmdConnect } from "./commands/connect.ts";
import { cmdList } from "./commands/list.ts";
import { cmdUse } from "./commands/use.ts";
import { cmdTables, cmdTablesPlain } from "./commands/tables.tsx";
import { cmdDescribe } from "./commands/describe.ts";
import { cmdQuery } from "./commands/query.ts";
import { cmdRemove } from "./commands/remove.ts";
import { cmdStatus } from "./commands/status.ts";
import { cmdUpgrade } from "./commands/upgrade.ts";
import { cmdBrowse, cmdBrowsePlain } from "./commands/browse.tsx";
import { ensureConfig } from "./core/config.ts";
import { c } from "./ui/render.ts";
import { isTTY } from "./utils/tty.ts";

const HELP = `${c.bold}oops${c.reset} — Multi-Instance DB Management Hub

${c.bold}Usage:${c.reset}
  oops                     interactive menu
  oops connect             add a new D1 instance (interactive)
  oops list                list configured instances
  oops use [name]          switch active instance
  oops status              show current config summary
  oops tables              introspect tables in active instance
  oops browse <table>      interactive TUI table browser
  oops describe <table>    show columns of a table
  oops query "<sql>"       run a SQL statement
  oops remove <name>       remove an instance
  oops upgrade             show upgrade options
  oops help                show this help

${c.dim}Config: ~/.config/oops/config.json (chmod 600)${c.reset}

${c.dim}Created by Sandi Andrian — github.com/andriansandi${c.reset}
`;

async function interactive(): Promise<void> {
  if (!isTTY()) {
    process.stderr.write(
      `${c.yellow}warning:${c.reset} interactive menu requires a TTY.\n` +
        `Run from a real terminal, or use a subcommand directly: oops help\n`,
    );
    process.exit(2);
  }
  const { select } = await import("@clack/prompts");
  const cfg = ensureConfig();
  const opts = [
    { value: "connect", label: "Add a D1 instance", hint: "connect" },
    { value: "list", label: "List instances", hint: "list" },
    { value: "use", label: "Switch active instance", hint: "use", disabled: cfg.instances.length === 0 },
    { value: "tables", label: "List tables", hint: "tables", disabled: cfg.instances.length === 0 },
    { value: "status", label: "Show status", hint: "status" },
    { value: "upgrade", label: "Upgrade to Pro", hint: "upgrade" },
    { value: "exit", label: "Exit" },
  ];
  const choice = await select({
    message: "What do you want to do?",
    options: opts,
  });
  if (typeof choice === "symbol" || choice === "exit") return;
  switch (choice) {
    case "connect": return cmdConnect();
    case "list": return cmdList();
    case "use": return cmdUse(undefined);
    case "tables": {
      const picked = await cmdTables();
      if (picked) return cmdBrowse(picked);
      return;
    }
    case "status": return cmdStatus();
    case "upgrade": return cmdUpgrade();
  }
}

function getArgs(): { cmd: string; rest: string[] } {
  const argv = process.argv.slice(2);
  return { cmd: argv[0] ?? "", rest: argv.slice(1) };
}

async function main() {
  const { cmd, rest } = getArgs();

  try {
    switch (cmd) {
      case "":
        return interactive();
      case "help":
      case "-h":
      case "--help":
        process.stdout.write(HELP + "\n");
        return;
      case "connect":
      case "add":
        return cmdConnect();
      case "list":
      case "ls":
        return cmdList();
      case "use":
        return cmdUse(rest[0]);
      case "tables":
      case "ls-tables": {
        if (!isTTY()) return cmdTablesPlain();
        const picked = await cmdTables();
        if (picked) return cmdBrowse(picked);
        return;
      }
      case "browse":
      case "ui":
        if (!isTTY()) return cmdBrowsePlain(rest[0]);
        return cmdBrowse(rest[0]);
      case "describe":
      case "schema":
        return cmdDescribe(rest[0]);
      case "query":
      case "sql":
        return cmdQuery(rest.join(" ").trim() || undefined);
      case "remove":
      case "rm":
        return cmdRemove(rest[0]);
      case "status":
        return cmdStatus();
      case "upgrade":
        return cmdUpgrade();
      default:
        process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
        process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`\n${c.red}error:${c.reset} ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
