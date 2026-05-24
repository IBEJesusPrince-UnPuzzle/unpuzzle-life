import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

const dbPath = join(process.cwd(), "data.db");
const migrationPath = join(process.cwd(), "server", "migrations", "0006_add_covers_id_to_supports.sql");

const db = new Database(dbPath);
const sql = readFileSync(migrationPath, "utf-8");

// Split by semicolons and execute each statement
const statements = sql.split(";").filter(s => s.trim());

for (const stmt of statements) {
  try {
    db.exec(stmt);
    console.log("✓ Applied:", stmt.trim().substring(0, 50) + "...");
  } catch (e: any) {
    if (e.message.includes("duplicate column")) {
      console.log("⊘ Already exists:", stmt.trim().substring(0, 50) + "...");
    } else {
      console.error("✗ Error:", e.message);
    }
  }
}

console.log("\nMigration complete!");
db.close();
