declare module "pg" {
  import type { DatabaseClient } from "./database.ts";

  export class Client implements DatabaseClient {
    constructor(config: {
      connectionString: string;
      connectionTimeoutMillis?: number;
      query_timeout?: number;
    });
    connect(): Promise<void>;
    end(): Promise<void>;
    query<Row extends object = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<{ rows: Row[]; rowCount?: number | null }>;
  }

  const pg: { Client: typeof Client };
  export default pg;
}
