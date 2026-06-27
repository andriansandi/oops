import {
  BaseAdaptor,
  type ColumnInfo,
  type InstanceMeta,
  type ListTablesOptions,
  type ListTablesResult,
  type QueryOptions,
  type QueryResult,
  type TableInfo,
  withTimeout,
  QUERY_TIMEOUT_MS,
  isInternalD1Name,
} from "../core/adaptor.ts";
import type { D1Credentials } from "../core/instance.ts";

const CF_API = "https://api.cloudflare.com/client/v4";

interface D1ApiSuccess<T> {
  success: true;
  result: T;
  errors: [];
  messages: [];
}

interface D1ApiError {
  success: false;
  errors: { code: number; message: string }[];
  messages: unknown[];
}

type D1ApiResponse<T> = D1ApiSuccess<T> | D1ApiError;

interface D1QueryResponseItem {
  results?: Record<string, unknown>[];
  success: boolean;
  meta?: {
    duration?: number;
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
    served_by_region?: string;
  };
}

function urlEncodePath(...parts: string[]): string {
  return parts
    .map((p) => encodeURIComponent(p))
    .join("/");
}

export class D1Adaptor extends BaseAdaptor {
  readonly type = "d1" as const;

  constructor(
    instance: InstanceMeta,
    private readonly creds: D1Credentials,
  ) {
    super(instance);
  }

  private get endpoint(): string {
    return `${CF_API}/accounts/${urlEncodePath(this.creds.accountId)}/d1/database/${urlEncodePath(this.creds.databaseId)}/query`;
  }

  private async request<T>(body: unknown, opts: QueryOptions = {}): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? QUERY_TIMEOUT_MS;
    const internal = new AbortController();
    const onExternalAbort = () => internal.abort();
    if (opts.signal) {
      if (opts.signal.aborted) internal.abort();
      else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    return withTimeout(
      (async () => {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.creds.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: internal.signal,
        });

        const json = (await res.json().catch(() => ({}))) as D1ApiResponse<T>;

        if (!res.ok) {
          const errs = (json as D1ApiError).errors ?? [];
          throw new Error(
            `Cloudflare API ${res.status}: ${errs.map((e) => e.message).join("; ") || res.statusText}`,
          );
        }

        if ("success" in json && json.success === false) {
          const errs = (json as D1ApiError).errors;
          throw new Error(
            `Cloudflare API error: ${errs.map((e) => e.message).join("; ")}`,
          );
        }

        return (json as D1ApiSuccess<T>).result;
      })(),
      timeoutMs,
    ).finally(() => {
      opts.signal?.removeEventListener("abort", onExternalAbort);
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query("SELECT 1", { timeoutMs: QUERY_TIMEOUT_MS });
      return true;
    } catch {
      return false;
    }
  }

  async listTables(
    opts: ListTablesOptions = {},
  ): Promise<ListTablesResult> {
    const result = await this.query<Record<string, unknown>>(
      "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
      opts,
    );
    const tables: TableInfo[] = [];
    const internal: TableInfo[] = [];
    for (const r of result.rows) {
      const rawType = String(r.type ?? "table");
      const type: TableInfo["type"] =
        rawType === "view" || rawType === "index" || rawType === "trigger"
          ? rawType
          : "table";
      const entry: TableInfo = {
        name: String(r.name),
        type,
        sql: r.sql == null ? null : String(r.sql),
      };
      if (isInternalD1Name(entry.name)) {
        internal.push(entry);
      } else {
        tables.push(entry);
      }
    }
    if (opts.includeInternal) {
      return { tables: [...tables, ...internal], internal };
    }
    return { tables, internal };
  }

  async describeTable(
    table: string,
    opts: QueryOptions = {},
  ): Promise<ColumnInfo[]> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
      throw new Error(`Invalid table identifier: ${table}`);
    }
    const result = await this.query<Record<string, unknown>>(
      `PRAGMA table_info(${table})`,
      opts,
    );
    return result.rows.map((r) => ({
      name: String(r.name),
      type: String(r.type),
      notnull: Number(r.notnull) === 1,
      pk: Number(r.pk) === 1,
      dflt_value: r.dflt_value,
    }));
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    opts: QueryOptions = {},
  ): Promise<QueryResult & { rows: T[] }> {
    const params = opts.params ?? [];
    const raw = await this.request<D1QueryResponseItem[]>(
      { sql, params },
      opts,
    );

    const first = Array.isArray(raw) ? raw[0] : raw;
    const rows = (first?.results ?? []) as T[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      columns,
      rows,
      duration_ms: first?.meta?.duration,
      rows_read: first?.meta?.rows_read,
      rows_written: first?.meta?.rows_written,
      last_row_id: first?.meta?.last_row_id,
    };
  }
}
