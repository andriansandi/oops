export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt_value: unknown;
}

export interface TableInfo {
  name: string;
  type: "table" | "view" | "index" | "trigger";
  sql: string | null;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rows_read?: number;
  rows_written?: number;
  duration_ms?: number;
  last_row_id?: number;
}

export interface ListTablesOptions extends QueryOptions {
  includeInternal?: boolean;
}

export interface ListTablesResult {
  tables: TableInfo[];
  internal: TableInfo[];
}

export const INTERNAL_D1_PATTERNS: readonly RegExp[] = [
  /^_cf_KV$/i,
  /^_cf_METADATA$/i,
  /^_cf_METADATA_KEY$/i,
  /^d1_migrations$/i,
  /^sqlite_%/i,
];

export function isInternalD1Name(name: string): boolean {
  return INTERNAL_D1_PATTERNS.some((re) => re.test(name));
}

export interface QueryOptions {
  params?: unknown[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface InstanceMeta {
  id: string;
  name: string;
  type: "d1" | "neon" | string;
  createdAt: string;
}

export abstract class BaseAdaptor {
  abstract readonly type: string;

  constructor(public readonly instance: InstanceMeta) {}

  abstract testConnection(): Promise<boolean>;
  abstract listTables(opts?: ListTablesOptions): Promise<ListTablesResult>;
  abstract describeTable(
    table: string,
    opts?: QueryOptions,
  ): Promise<ColumnInfo[]>;
  abstract query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    opts?: QueryOptions,
  ): Promise<QueryResult & { rows: T[] }>;
}

export const QUERY_TIMEOUT_MS = 5_000;

export class QueryTimeoutError extends Error {
  constructor(ms: number) {
    super(`Query exceeded ${ms}ms timeout`);
    this.name = "QueryTimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = QUERY_TIMEOUT_MS,
  external?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new QueryTimeoutError(ms)), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    if (external) {
      if (external.aborted) return onAbort();
      external.addEventListener("abort", onAbort, { once: true });
    }
    promise
      .then((v) => {
        clearTimeout(timer);
        external?.removeEventListener("abort", onAbort);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        external?.removeEventListener("abort", onAbort);
        reject(e);
      });
  });
}
