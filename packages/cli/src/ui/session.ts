import readline from "node:readline";
import { cursor } from "./ansi.ts";
import type { KeyEvent } from "./prompt.ts";

export interface SessionOptions<S> {
  initial: S;
  render(state: S): string;
  onKey(state: S, key: KeyEvent): { state: S; exit: boolean };
  onStateChanged?(state: S): Promise<S> | S;
  onStart?(state: S): Promise<S> | S;
  onExit?(state: S): void;
}

export async function runSession<S>(opts: SessionOptions<S>): Promise<S> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return runPlain<S>(opts);
  }
  return runInteractive<S>(opts);
}

async function runPlain<S>(opts: SessionOptions<S>): Promise<S> {
  let state = opts.initial;
  if (opts.onStart) state = await opts.onStart(state);
  process.stdout.write(opts.render(state) + "\n");
  if (opts.onExit) opts.onExit(state);
  return state;
}

async function runInteractive<S>(opts: SessionOptions<S>): Promise<S> {
  let state = opts.initial;
  if (opts.onStart) state = await opts.onStart(state);
  if (opts.onStateChanged) state = await opts.onStateChanged(state);

  const stdin = process.stdin;
  const stdout = process.stdout;
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode?.(true);
  stdin.resume();

  let lastRenderHeight = 0;
  function redraw() {
    const frame = opts.render(state);
    const lines = frame.split("\n");
    if (lastRenderHeight > lines.length) {
      for (let i = lines.length; i < lastRenderHeight; i++) {
        stdout.write("\n" + cursor.clearLine());
      }
    }
    stdout.write(cursor.to(1, 1));
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) stdout.write("\n" + cursor.clearLine());
      stdout.write(lines[i]);
    }
    lastRenderHeight = lines.length;
  }

  redraw();

  return new Promise<S>((resolve) => {
    const onKeypress = (
      _s: unknown,
      key: KeyEvent & { sequence?: string },
    ) => {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        cleanup(state);
        return;
      }
      try {
        const r = opts.onKey(state, key);
        state = r.state;
        redraw();
        if (r.exit) {
          cleanup(state);
          return;
        }
        Promise.resolve(opts.onStateChanged?.(state)).then((next) => {
          if (next && next !== state) {
            state = next;
            redraw();
          }
        });
      } catch (err) {
        process.stderr.write(`\nerror: ${(err as Error).message}\n`);
        cleanup(state);
      }
    };

    const onSigWinch = () => redraw();
    const onSigInt = () => cleanup(state);

    function cleanup(finalState: S) {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.removeListener("keypress", onKeypress as never);
      process.removeListener("SIGWINCH", onSigWinch);
      process.removeListener("SIGINT", onSigInt);
      stdout.write(cursor.show());
      if (lastRenderHeight > 0) {
        stdout.write("\n");
      }
      opts.onExit?.(finalState);
      resolve(finalState);
    }

    stdin.on("keypress", onKeypress as never);
    process.on("SIGWINCH", onSigWinch);
    process.on("SIGINT", onSigInt);
    stdout.write(cursor.hide());
  });
}
