export type SafetyLevel = "safe" | "confirm" | "destructive";

export interface SqlClassification {
  level: SafetyLevel;
  operation: string | null;
  reason: string;
}

const SAFE_OPS = new Set(["SELECT", "PRAGMA", "EXPLAIN", "WITH"]);

export function classifySql(sql: string): SqlClassification {
  const trimmed = sql.trim();
  const firstWord = (trimmed.match(/^([A-Za-z]+)/)?.[1] ?? "").toUpperCase();
  return {
    level: SAFE_OPS.has(firstWord) ? "safe" : "confirm",
    operation: firstWord || null,
    reason: "",
  };
}
