import * as SQLite from 'expo-sqlite';
import { createRepository, type Repository, type SQLiteDriver } from './repository';

let opening: Promise<Repository> | undefined;

/** SQLite is local on Android/iOS; Expo's web support uses browser-local storage. */
export function openRepository(): Promise<Repository> {
  if (!opening) {
    opening = (async () => {
      const database = await SQLite.openDatabaseAsync('noeting.db');
      const driver: SQLiteDriver = {
        exec: (sql) => database.execAsync(sql),
        run: (sql, parameters = []) => database.runAsync(sql, parameters),
        all: <T>(sql: string, parameters = []) => database.getAllAsync<T>(sql, parameters),
      };
      const repository = createRepository(driver);
      try {
        await repository.initialize();
      } catch (error) {
        await database.closeAsync().catch(() => undefined);
        throw error;
      }
      return repository;
    })().catch((error: unknown) => {
      // Startup can be retried after a recoverable database/storage problem.
      opening = undefined;
      throw error;
    });
  }
  return opening;
}
