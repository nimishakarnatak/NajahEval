import { neon } from "@neondatabase/serverless";

import { NAJAH_SCHEMA_STATEMENTS } from "@/db/schema";

/** Values accepted by the parameterized SQL adapter. */
export type DatabaseValue = string | number | boolean | null | Date | Uint8Array;

/** Shape returned by the small database query layer used by the app. */
export type QueryResult<T extends Record<string, unknown>> = {
  results: T[];
};

type NeonDatabase = ReturnType<typeof neon>;

/**
 * Convert the SQLite-style `?` placeholders used by the original application
 * to PostgreSQL's numbered placeholders. All values remain separately bound;
 * this function never interpolates user-provided content into SQL text.
 */
export function postgresPlaceholders(sql: string): string {
  let parameter = 0;
  return sql.replace(/\?/g, () => `$${(parameter += 1)}`);
}

/**
 * A prepared, parameterized query. The methods intentionally mirror the small
 * subset of Cloudflare D1 that the application used before its Netlify move.
 * Keeping that surface narrow makes the migration auditable and prevents SQL
 * differences from leaking into the annotation routes.
 */
export class PreparedQuery {
  private values: DatabaseValue[] = [];

  constructor(
    private readonly database: NeonDatabase,
    private readonly sql: string,
  ) {}

  /** Return a new prepared query with values bound in placeholder order. */
  bind(...values: DatabaseValue[]): PreparedQuery {
    const query = new PreparedQuery(this.database, this.sql);
    query.values = values;
    return query;
  }

  /** Execute a read query and return its first row, or `null` when empty. */
  async first<T extends Record<string, unknown>>(): Promise<T | null> {
    const rows = await this.rows<T>();
    return rows[0] ?? null;
  }

  /** Execute a read query and return rows in the shape expected by callers. */
  async all<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<T>> {
    return { results: await this.rows<T>() };
  }

  /** Execute a mutation or DDL statement. */
  async run(): Promise<{ success: true }> {
    await this.rows();
    return { success: true };
  }

  /** SQL text and values used internally for transactions. */
  compiled(): { text: string; values: DatabaseValue[] } {
    return { text: postgresPlaceholders(this.sql), values: this.values };
  }

  private async rows<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T[]> {
    const query = this.compiled();
    const rows = await this.database.query(query.text, query.values);
    return rows as T[];
  }
}

/**
 * Application database facade backed by Neon Postgres.
 *
 * The HTTP-based Neon driver is designed for serverless functions and avoids
 * keeping a TCP connection pool alive between separate Netlify invocations.
 */
export class AppDatabase {
  constructor(private readonly database: NeonDatabase) {}

  prepare(sql: string): PreparedQuery {
    return new PreparedQuery(this.database, sql);
  }

  /** Run several prepared statements in one non-interactive transaction. */
  async batch(queries: PreparedQuery[]): Promise<void> {
    await this.database.transaction(
      queries.map((query) => {
        const compiled = query.compiled();
        return this.database.query(compiled.text, compiled.values);
      }),
    );
  }

  /** Execute arbitrary SQL with separately bound values. */
  async execute<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ): Promise<T[]> {
    const rows = await this.database.query(sql, values);
    return rows as T[];
  }
}

let appDatabase: AppDatabase | null = null;

/** Return the shared Neon HTTP query client for this serverless runtime. */
export function getDatabase(): AppDatabase {
  if (!appDatabase) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not configured. Add the Neon Postgres connection string in Netlify environment variables.",
      );
    }
    appDatabase = new AppDatabase(neon(connectionString));
  }
  return appDatabase;
}

let schemaReady: Promise<void> | null = null;

/**
 * Ensure a newly created external Postgres database has the required tables.
 *
 * The fast path is one harmless read. If the schema is absent, all idempotent
 * DDL statements run atomically under a transaction-scoped advisory lock. The
 * lock prevents simultaneous first requests from racing to create the tables.
 */
export async function ensureNajahSchema(db: AppDatabase): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        await db.prepare("SELECT user_id FROM users LIMIT 1").first();
      } catch {
        await db.batch(NAJAH_SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)));
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
