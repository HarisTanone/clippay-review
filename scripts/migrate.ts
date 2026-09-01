import fs from "fs";
import path from "path";
import { pool } from "../lib/db";

async function main() {
  console.log("Menjalankan migrasi database...");
  const migrationFile = path.join(__dirname, "../migrations/01_performance_indexes.sql");
  const sql = fs.readFileSync(migrationFile, "utf-8");

  await pool.query(sql);
  console.log("Migrasi selesai!");
  await pool.end();
}

main().catch((err) => {
  console.error("Gagal menjalankan migrasi:", err);
  process.exit(1);
});
