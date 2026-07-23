import "dotenv/config";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";

import { loadConfig } from "../config";
import { seedPublicRecipes } from "./seed-public-recipes";

const config = loadConfig();
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(
  currentDirectory,
  "../../../../database/migrations",
);

const connection = await mysql.createConnection({
  host: config.DATABASE_HOST,
  port: config.DATABASE_PORT,
  database: config.DATABASE_NAME,
  user: config.DATABASE_USER,
  password: config.DATABASE_PASSWORD,
  charset: "utf8mb4",
  timezone: "Z",
  multipleStatements: true,
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of filenames) {
    const sql = await readFile(
      path.join(migrationsDirectory, filename),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const [existingRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT checksum FROM schema_migrations WHERE filename = ?",
      [filename],
    );
    const existing = existingRows[0];

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(`已执行的迁移 ${filename} 内容发生变化`);
      }
      continue;
    }

    console.info(`执行数据库迁移：${filename}`);
    await connection.query(sql);
    await connection.execute(
      "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
      [filename, checksum],
    );
  }

  await seedPublicRecipes(connection);

  console.info("数据库迁移完成");
} finally {
  await connection.end();
}
