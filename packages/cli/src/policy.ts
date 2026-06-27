export type SafetyLevel = "safe" | "confirm" | "destructive";

export interface SqlClassification {
  level: SafetyLevel;
  operation: string | null;
  reason: string;
}

const SAFE_OPS = new Set(["SELECT", "PRAGMA", "EXPLAIN"]);
const DESTRUCTIVE_OPS = new Set(["DROP", "TRUNCATE", "ALTER"]);
const SEVERITY: Record<SafetyLevel, number> = { safe: 0, confirm: 1, destructive: 2 };

function levelFor(op: string): SafetyLevel {
  if (SAFE_OPS.has(op)) return "safe";
  if (DESTRUCTIVE_OPS.has(op)) return "destructive";
  return "confirm";
}

function stripLeadingComments(sql: string): string {
  let s = sql;
  for (;;) {
    s = s.trimStart();
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      if (nl === -1) return "";
      s = s.slice(nl + 1);
    } else if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      if (end === -1) return "";
      s = s.slice(end + 2);
    } else {
      return s;
    }
  }
}

const isIdentChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);

function skipParen(s: string, i: number): number {
  let depth = 0;
  while (i < s.length) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return i;
}

function withMainKeyword(sql: string): string | null {
  const s = sql;
  const n = s.length;
  const skipWs = (i: number) => {
    while (i < n && /\s/.test(s[i])) i++;
    return i;
  };
  let i = skipWs(4);
  if (s.slice(i, i + 9).toUpperCase() === "RECURSIVE" && (i + 9 >= n || !isIdentChar(s[i + 9]))) {
    i = skipWs(i + 9);
  }
  for (;;) {
    i = skipWs(i);
    if (i >= n) return null;
    if (s[i] === '"' || s[i] === "`" || s[i] === "[") {
      const close = s[i] === "[" ? "]" : s[i];
      i++;
      while (i < n && s[i] !== close) i++;
      if (i >= n) return null;
      i++;
    } else {
      while (i < n && isIdentChar(s[i])) i++;
    }
    i = skipWs(i);
    if (i < n && s[i] === "(") {
      i = skipWs(skipParen(s, i));
    }
    if (s.slice(i, i + 2).toUpperCase() === "AS" && (i + 2 >= n || !isIdentChar(s[i + 2]))) {
      i = skipWs(i + 2);
    }
    if (i >= n || s[i] !== "(") return null;
    i = skipWs(skipParen(s, i));
    if (i < n && s[i] === ",") {
      i++;
      continue;
    }
    break;
  }
  i = skipWs(i);
  const m = s.slice(i).match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : null;
}

function classifySingle(sql: string): SqlClassification {
  const stripped = stripLeadingComments(sql);
  const firstWord = (stripped.match(/^([A-Za-z]+)/)?.[1] ?? "").toUpperCase();
  if (firstWord === "WITH") {
    const main = withMainKeyword(stripped);
    if (main) return { level: levelFor(main), operation: main, reason: "" };
    return { level: "confirm", operation: "WITH", reason: "unable to parse WITH clause" };
  }
  return {
    level: levelFor(firstWord),
    operation: firstWord || null,
    reason: "",
  };
}

export function classifySql(sql: string): SqlClassification {
  const statements = sql.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  if (statements.length === 0) {
    return { level: "safe", operation: null, reason: "empty statement" };
  }
  let worst = classifySingle(statements[0]);
  for (let i = 1; i < statements.length; i++) {
    const c = classifySingle(statements[i]);
    if (SEVERITY[c.level] > SEVERITY[worst.level]) worst = c;
  }
  return worst;
}
