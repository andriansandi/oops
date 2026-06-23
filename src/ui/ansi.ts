const ESC = "\x1b";
const CSI = `${ESC}[`;

const wrap = (open: string) => (s: string) => `${CSI}${open}m${s}${CSI}0m`;

export const style = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  gray: wrap("90"),
};

export const cursor = {
  hide: () => `${CSI}?25l`,
  show: () => `${CSI}?25h`,
  save: () => `${CSI}s`,
  restore: () => `${CSI}u`,
  clearLine: () => `${CSI}2K`,
  moveUp: (n: number) => `${CSI}${n}A`,
  moveDown: (n: number) => `${CSI}${n}B`,
  moveLeft: (n: number) => `${CSI}${n}D`,
  moveRight: (n: number) => `${CSI}${n}C`,
  to: (row: number, col: number) => `${CSI}${row};${col}H`,
};

const ANSI_RE = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");

export function strip(s: string): string {
  return s.replace(ANSI_RE, "");
}
