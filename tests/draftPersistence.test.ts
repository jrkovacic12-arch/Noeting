import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DraftPersistence } from '../src/ui/draftPersistence';
import type { EditorDraft } from '../src/ui/EntryEditor';
const draft = (text: string, requestId = 'stable'): EditorDraft => ({kind:'note', text, requestId});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('rapid updates coalesce; flush stores latest independent contexts and request IDs', async () => {
  const writes: string[] = [];
  const store = new DraftPersistence(async raw => { writes.push(raw); }, () => {});
  for (let i=0; i<100; i++) store.put('new:note', draft(`words ${i}`));
  store.put('new:task', {...draft('Task words', 'task-request'), kind:'task'});
  assert.equal(await store.flush(), true);
  assert.ok(writes.length < 10, `Expected fewer than 10 writes, got ${writes.length}`);
  assert.deepEqual(JSON.parse(writes.at(-1)!), store.values);
  assert.equal(store.values['new:note'].text, 'words 99');
  assert.equal(store.values['new:task'].requestId, 'task-request');
});

test('leading write and bounded trailing write persist without waiting for navigation', async () => {
  const writes: string[] = [];
  const store = new DraftPersistence(async raw => { writes.push(raw); }, () => {});
  store.put('new:note', draft('first'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(JSON.parse(writes[0])['new:note'].text, 'first');
  store.put('new:note', draft('latest'));
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(JSON.parse(writes.at(-1)!)['new:note'].text, 'latest');
});

test('failed writes retain memory, report failure, and retry the latest words', async () => {
  let failing = true; let saved = '';
  const store = new DraftPersistence(async raw => { if(failing) throw Error('injected'); saved=raw; }, () => {});
  store.put('new:note', draft('retained'));
  assert.equal(await store.flush(), false);
  assert.match(store.error!, /Unsaved/);
  assert.equal(store.values['new:note'].text, 'retained');
  failing=false;
  assert.equal(await store.flush(), true);
  assert.equal(JSON.parse(saved)['new:note'].text, 'retained');
  assert.equal(store.error, null);
});

test('flush waits for second edit during an older successful write', async () => {
  const gate = deferred(); const writes: string[] = []; let active=0, maxActive=0;
  const store = new DraftPersistence(async raw => {
    active++; maxActive=Math.max(maxActive,active);
    if (!writes.length) await gate.promise;
    writes.push(raw); active--;
  }, () => {});
  store.put('edit:one', draft('first'));
  const flushing = store.flush();
  await Promise.resolve();
  store.put('edit:one', draft('second'));
  gate.resolve();
  assert.equal(await flushing, true);
  assert.equal(JSON.parse(writes.at(-1)!)['edit:one'].text, 'second');
  assert.equal(maxActive,1);
});

test('failed discard retains visible words; retry removes only its context', async () => {
  let failing = false; let saved = '';
  const store = new DraftPersistence(async raw => { if(failing) throw Error('injected'); saved=raw; }, () => {});
  store.put('new:note', draft('cancel me')); store.put('new:task', draft('keep me'));
  await store.flush(); failing=true;
  assert.equal(await store.discard('new:note'), false);
  assert.equal(store.values['new:note'].text, 'cancel me');
  assert.match(store.error!, /discard/);
  failing=false;
  assert.equal(await store.discard('new:note'), true);
  assert.equal(store.values['new:note'],undefined);
  assert.equal(JSON.parse(saved)['new:task'].text, 'keep me');
});

test('discard cannot erase a newer edit or changes in another context while writing', async () => {
  let gate: ReturnType<typeof deferred> | undefined;
  let saved='';
  const store = new DraftPersistence(async raw => { if(gate) await gate.promise; saved=raw; }, () => {});
  store.put('new:note',draft('old')); await store.flush();
  gate=deferred();
  const discarding=store.discard('new:note'); await Promise.resolve();
  store.put('new:note',draft('new')); store.put('new:task',draft('other'));
  gate.resolve();
  assert.equal(await discarding,false);
  assert.equal(store.values['new:note'].text,'new');
  assert.equal(await store.flush(),true);
  assert.equal(JSON.parse(saved)['new:note'].text,'new');
  assert.equal(JSON.parse(saved)['new:task'].text,'other');
});

test('successful discard preserves another context edited during deletion', async () => {
  let gate: ReturnType<typeof deferred> | undefined; let saved='';
  const store = new DraftPersistence(async raw => { if(gate) await gate.promise; saved=raw; }, () => {});
  store.put('new:note',draft('discard')); store.put('new:task',draft('old task')); await store.flush();
  gate=deferred();
  const discarding=store.discard('new:note'); await Promise.resolve();
  store.put('new:task',draft('new task'));
  gate.resolve();
  assert.equal(await discarding,true);
  assert.equal(store.values['new:note'],undefined);
  assert.equal(JSON.parse(saved)['new:task'].text,'new task');
  assert.equal(JSON.parse(saved)['new:note'],undefined);
});
