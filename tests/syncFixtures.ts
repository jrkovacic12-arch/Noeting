import { DatabaseSync } from "node:sqlite";
import { createRepository, type SQLiteDriver } from "../src/data/repository";
export function replica(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
  const driver: SQLiteDriver = {
    async exec(s) {
      db.exec(s);
    },
    async run(s, p = []) {
      return { changes: Number(db.prepare(s).run(...p).changes) };
    },
    async all<T>(s: string, p = []) {
      return db.prepare(s).all(...p) as T[];
    },
  };
  return { db, driver, repo: createRepository(driver) };
}
