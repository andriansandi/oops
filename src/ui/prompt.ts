import readline from "node:readline";
import { style } from "./ansi.ts";

export interface KeyEvent {
  sequence?: string;
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface KeyResult {
  value: string;
  consumed: boolean;
}

export function applyFilterKey(value: string, key: KeyEvent): KeyResult {
  if (key.ctrl && key.name === "u") {
    return { value: "", consumed: true };
  }
  if (key.name === "backspace") {
    return { value: value.slice(0, -1), consumed: true };
  }
  if (key.name === "return" || key.name === "escape") {
    return { value, consumed: true };
  }
  if (key.name && key.name !== "space" && key.name !== "tab") {
    return { value, consumed: false };
  }
  const seq = key.sequence ?? "";
  if (seq.length === 0) return { value, consumed: false };
  if (seq.charCodeAt(0) === 0x1b) return { value, consumed: false };
  if (key.ctrl || key.meta) return { value, consumed: false };
  return { value: value + seq, consumed: true };
}

export interface ReadLineOptions {
  prompt?: string;
  initial?: string;
}

export function readFilter(opts: ReadLineOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(null);
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let value = opts.initial ?? "";

    const onKey = (
      _s: unknown,
      key: KeyEvent & { name?: string; sequence?: string },
    ) => {
      const r = applyFilterKey(value, key);
      value = r.value;
      if (key.name === "return") {
        cleanup();
        resolve(value);
      } else if (key.name === "escape") {
        cleanup();
        resolve(null);
      }
    };
    const cleanup = () => {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.removeListener("keypress", onKey as never);
      rl.close();
    };

    process.stdout.write(opts.prompt ? style.cyan(opts.prompt) : "");
    if (value) process.stdout.write(value);

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKey as never);
    process.stdin.setRawMode?.(true);
    rl.on("close", () => {
      process.stdin.setRawMode?.(false);
      resolve(value);
    });
  });
}

export function isPrintable(key: KeyEvent): boolean {
  const seq = key.sequence ?? "";
  if (seq.length === 0) return false;
  if (seq.charCodeAt(0) === 0x1b) return false;
  if (key.ctrl || key.meta) return false;
  return true;
}
