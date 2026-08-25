import { getDatabase as getNetlifyDatabase } from "@netlify/database";

/** Values accepted by the parameterized SQL adapter. */
export type DatabaseValue = string | number | boolean | null | Date | Uint8Array;

/** Shape returned by the small D1-compatible query layer used by the app. */
export type QueryResult<T extends Record<string, unknown>> = {
  results: T[];
};

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
    private readonly database: ReturnType<typeof getNetlifyDatabase>,
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
    const rows = await this.database.sql.unsafe(query.text, query.values);
    return rows as T[];
  }
}

/**
 * Application database facade backed by Netlify Database (managed Postgres).
 * It supports prepared queries, atomic batches, and an escape hatch for a
 * single large parameterized statement such as the bundled dataset upsert.
 */
export class AppDatabase {
  constructor(private readonly database: ReturnType<typeof getNetlifyDatabase>) {}

  prepare(sql: string): PreparedQuery {
    return new PreparedQuery(this.database, sql);
  }

  /** Run several prepared statements in one PostgreSQL transaction. */
  async batch(queries: PreparedQuery[]): Promise<void> {
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      for (const query of queries) {
        const compiled = query.compiled();
        await client.query(compiled.text, compiled.values);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Execute arbitrary SQL with separately bound values. */
  async execute<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values: DatabaseValue[] = [],
  ): Promise<T[]> {
    const rows = await this.database.sql.unsafe(sql, values);
    return rows as T[];
  }
}

let appDatabase: AppDatabase | null = null;

/**
 * Return the shared database client.
 *
 * On Netlify the package automatically selects the production database or the
 * isolated deploy-preview branch. `DATABASE_URL` is supported as an explicit
 * override for local development and for a portable external Postgres host.
 */
export function getDatabase(): AppDatabase {
  if (!appDatabase) {
    const connectionString = process.env.DATABASE_URL?.trim();
    const database = getNetlifyDatabase(
      connectionString ? { connectionString } : undefined,
    );
    appDatabase = new AppDatabase(database);
  }
  return appDatabase;
}

let schemaCheck: Promise<void> | null = null;

/**
 * Confirm that the versioned database migration has run.
 *
 * Netlify applies files in `netlify/database/migrations` before publishing a
 * deploy. This inexpensive, once-per-runtime check produces a useful error for
 * developers who run `next dev` against an uninitialized external database.
 */
export async function ensureNajahSchema(db: AppDatabase): Promise<void> {
  if (!schemaCheck) {
    schemaCheck = db
      .prepare("SELECT user_id FROM users LIMIT 1")
      .first()
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaCheck = null;
        throw new Error(
          "The Najah database schema is missing. Run `netlify dev` or apply the migration in netlify/database/migrations.",
          { cause: error },
        );
      });
  }
  await schemaCheck;
}
