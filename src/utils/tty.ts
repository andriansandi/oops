export function isTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
