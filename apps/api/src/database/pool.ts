import mysql, { type Pool } from "mysql2/promise";

import type { AppConfig } from "../config";

export function createDatabasePool(config: AppConfig): Pool {
  return mysql.createPool({
    host: config.DATABASE_HOST,
    port: config.DATABASE_PORT,
    database: config.DATABASE_NAME,
    user: config.DATABASE_USER,
    password: config.DATABASE_PASSWORD,
    connectionLimit: config.DATABASE_CONNECTION_LIMIT,
    enableKeepAlive: true,
    timezone: "Z",
    charset: "utf8mb4",
  });
}
