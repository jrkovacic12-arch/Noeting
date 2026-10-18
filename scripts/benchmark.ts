// Synthetic data only. Run: node --expose-gc --import tsx scripts/benchmark.ts
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRepository, type SQLiteDriver } from '../src/data/repository';
import { indexSnapshot, visibleEntries } from '../src/data/selectors';

async function main() {
const directory = await mkdtemp(join(tmpdir(), 'noeting-benchmark-'));
const db = new DatabaseSync(join(directory, 'synthetic.db'));
let reads = 0, writes = 0;
const driver: SQLiteDriver = {
  async exec(sql) { writes++; db.exec(sql); },
  async run(sql, params = []) { writes++; return { changes: Number(db.prepare(sql).run(...params).changes) }; },
  async all<T>(sql: string, params = []) { reads++; return db.prepare(sql).all(...params) as T[]; },
};
const repo = createRepository(driver);
const results: Record<string, unknown> = {};
async function measure(name: string, action: () => unknown, repeats = 20) {
  const times: number[] = []; const startReads = reads, startWrites = writes;
  for (let i = 0; i < repeats; i++) {
    const start = performance.now(); await action(); times.push(performance.now() - start);
  }
  times.sort((a,b) => a-b);
  results[name] = { medianMs: +times[Math.floor(times.length/2)].toFixed(3), p95Ms: +times[Math.min(times.length-1,Math.floor(times.length*.95))].toFixed(3), readsPerRun: (reads-startReads)/repeats, driverWritesPerRun: (writes-startWrites)/repeats };
}
try {
  await repo.initialize();
  db.exec(await readFile(join(process.cwd(), 'scripts/benchmark-fixture.sql'), 'utf8'));
  await measure('startupSnapshot', () => createRepository(driver).readSnapshot());
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  let snapshot = await repo.readSnapshot();
  global.gc?.();
  results.snapshotHeapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  await measure('indexAndOpenDetail', () => indexSnapshot(snapshot).entries.get('n999'));
  await measure('noteSearch', () => visibleEntries(snapshot, 'note', 'Note 2999'));
  await measure('childSearch', () => visibleEntries(snapshot, 'task', 'needle 999'));
  await measure('tabAndFolderFilters', () => { visibleEntries(snapshot, 'task', ''); visibleEntries(snapshot, 'note', '', 'unfiled'); });
  let revision = 0;
  await measure('oneCharacterEditAndRefresh', async () => { await repo.editEntry('n999', `Note 999${revision++ % 2 ? 'x' : 'y'}`); snapshot = await repo.readSnapshot(); });
  console.log(JSON.stringify({ node: process.version, scale: { notes: 3000, groups: 1000, children: 1000 }, results }, null, 2));
} finally { db.close(); await rm(directory, {recursive:true,force:true}); }

}
void main();
