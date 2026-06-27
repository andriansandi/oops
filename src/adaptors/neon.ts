import { neon, type FullQueryResults } from "@neondatabase/serverless";
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
} from "../core/adaptor.ts";
import type { NeonCredentials } from "../core/config.ts";

export function toDollarPlaceholders(
  sql: string,
  params: readonly unknown[],
): string {
  if (params.length === 0) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export interface NeonSqlLike {
  query(
    query: string,
    params: unknown[],
    opts?: { fetchOptions?: { signal?: AbortSignal } },
  ): Promise<FullQueryResults<false>>;
}

export class NeonAdaptor extends BaseAdaptor {
  readonly type = "neon" as const;
  private readonly sql: NeonSqlLike;

  constructor(
    instance: InstanceMeta,
    creds: NeonCredentials,
    sql?: NeonSqlLike,
  ) {
    super(instance);
    this.sql = sql ?? neon(creds.connectionString, { fullResults: true });
  }

  private exec(
    query: string,
    params: unknown[],
    opts: QueryOptions = {},
  ): Promise<FullQueryResults<false>> {
    const timeoutMs = opts.timeoutMs ?? QUERY_TIMEOUT_MS;
    const dollarSql = toDollarPlaceholders(query, params);
    return withTimeout(
      this.sql.query(dollarSql, params, {
        fetchOptions: { signal: opts.signal },
      }),
      timeoutMs,
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.exec("SELECT 1", []);
      return true;
    } catch {
      return false;
    }
  }

  async listTables(opts: ListTablesOptions = {}): Promise<ListTablesResult> {
    const res = await this.exec(
      `SELECT table_name AS name, table_type AS type
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
      [],
      opts,
    );
    const tables: TableInfo[] = [];
    for (const r of res.rows as { name: string; type: string }[]) {
      tables.push({
        name: r.name,
        type: r.type === "VIEW" ? "view" : "table",
        sql: null,
      });
    }
    return { tables, internal: [] };
  }

  async describeTable(
    table: string,
    opts: QueryOptions = {},
  ): Promise<ColumnInfo[]> {
    const [cols, pks] = await Promise.all([
      this.exec(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
        opts,
      ),
      this.exec(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
         WHERE tc.table_schema = 'public' AND tc.table_name = $1
           AND tc.constraint_type = 'PRIMARY KEY'`,
        [table],
        opts,
      ),
    ]);
    const pkSet = new Set(
      (pks.rows as { column_name: string }[]).map((r) => r.column_name),
    );
    return (cols.rows as {
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: unknown;
    }[]).map((r) => ({
      name: r.column_name,
      type: r.data_type,
      notnull: r.is_nullable === "NO",
      pk: pkSet.has(r.column_name),
      dflt_value: r.column_default,
    }));
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    opts: QueryOptions = {},
  ): Promise<QueryResult & { rows: T[] }> {
    const params = opts.params ?? [];
    const res = await this.exec(sql, params, opts);
    const rows = res.rows as T[];
    const columns =
      res.fields.length > 0
        ? res.fields.map((f) => f.name)
        : rows.length > 0
          ? Object.keys(rows[0])
          : [];
    const isWrite = res.command !== "SELECT" && res.command !== "";
    return {
      columns,
      rows,
      rows_written: isWrite ? res.rowCount : undefined,
    };
  }
}
