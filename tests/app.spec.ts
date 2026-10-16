import { chromium, expect, test as base, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type BrowserSession = {
  page: Page;
  restart: () => Promise<Page>;
};

type SQLiteTestWindow = Window & { __noetingSQLite?: { worker: Worker; nativeDatabaseId: number }; __noetingAppearance?: { worker: Worker; nativeDatabaseId: number } };

const test = base.extend<{ session: BrowserSession; observeSQLite: boolean }>({
  observeSQLite: [false, { option: true }],
  session: async ({ baseURL, observeSQLite }, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'noeting-ui-'));
    let context: BrowserContext | undefined;
    const shutdown = async () => {
      // Persistent Chromium restores open tabs on the next launch. Close them
      // first so this single-app durability test does not create competing OPFS
      // database owners. The on-disk profile and actual SQLite data are retained.
      for (const page of context?.pages() ?? []) await page.close();
      await context?.close();
    };
    const launch = async () => {
      context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
        headless: true,
        args: ['--no-sandbox'],
        baseURL,
        viewport: { width: 430, height: 900 },
      });
      await context.addInitScript((observeDatabase) => {
        // Observe the real worker, preserving all application messages/results.
        // A test can add an actual SQLite constraint without a product test API.
        const original = Worker.prototype.postMessage;
        const seen = new WeakSet<Worker>();
        Worker.prototype.postMessage = function (message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
          if (!seen.has(this)) {
            seen.add(this);
            this.addEventListener('message', (event: MessageEvent) => {
              if (event.data.error) console.error('NOETING_SQLITE_ERROR', String(event.data.error));
            });
          }
          const packet = message as { type?: string; data?: { databasePath?: string; nativeDatabaseId: number } };
          if (observeDatabase && packet.type === 'open' && packet.data?.databasePath?.endsWith('noeting.db')) {
            (window as SQLiteTestWindow).__noetingSQLite = { worker: this, nativeDatabaseId: packet.data.nativeDatabaseId };
          }
          if(observeDatabase && packet.type==='open' && packet.data?.databasePath?.endsWith('ExpoSQLiteStorage')) {
            (window as SQLiteTestWindow).__noetingAppearance={worker:this,nativeDatabaseId:packet.data.nativeDatabaseId};
          }
          const forward = original.bind(this);
          if (Array.isArray(options)) forward(message, options);
          else forward(message, options);
        };
      }, observeSQLite);
      const page = context.pages()[0] ?? await context.newPage();
      page.on('console', (message) => {
        if (message.text().startsWith('NOETING_SQLITE_ERROR')) console.warn(message.text());
      });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Notes', exact:true })).toBeVisible();
      return page;
    };
    try {
      const page = await launch();
      await use({
        page,
        restart: async () => {
          await shutdown();
          return launch();
        },
      });
    } finally {
      await shutdown();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

async function databaseSQL(page: Page, sql: string, appearance=false) {
  await page.evaluate(async ({source,appearance}) => {
    const database = appearance?(window as SQLiteTestWindow).__noetingAppearance:(window as SQLiteTestWindow).__noetingSQLite;
    if (!database) throw new Error('The real Expo SQLite worker was not observed.');
    const id = -Math.floor(Math.random() * 1_000_000) - 1;
    await new Promise<void>((resolve, reject) => {
      const listener = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        database.worker.removeEventListener('message', listener);
        if (event.data.error) reject(new Error(String(event.data.error)));
        else resolve();
      };
      database.worker.addEventListener('message', listener);
      database.worker.postMessage({ type: 'exec', id, isSync: false, data: { nativeDatabaseId: database.nativeDatabaseId, source } });
    });
  }, {source:sql,appearance});
}

async function saveText(page:Page,name:'Note'|'Task'|'Subtask',text:string) {
  await page.getByRole('textbox',{name:`${name} text`,exact:true}).fill(text);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('textbox',{name:`${name} text`,exact:true})).toHaveCount(0);
}
async function capture(page:Page,kind:'note'|'task',text:string) {
  await page.getByRole('tab',{name:kind==='note'?'Notes':'Tasks',exact:true}).click();
  await page.getByRole('button',{name:`Add ${kind}`,exact:true}).click();
  if(kind==='task')await expect(page.getByTestId('task-sheet')).toBeVisible();
  else await expect(page.getByTestId('task-sheet')).toHaveCount(0);
  await saveText(page,kind==='note'?'Note':'Task',text);
  await expect(page.getByRole('button',{name:`Open ${kind}: ${text}`,exact:true})).toBeVisible();
}
async function open(page:Page,kind:'note'|'task',text:string) {await page.getByRole('button',{name:`Open ${kind}: ${text}`,exact:true}).click();}
async function link(page:Page,kind:'note'|'task',text:string) {
  await page.getByRole('button',{name:'Add linked entry',exact:true}).click();
  await page.getByRole('button',{name:`New linked ${kind}`,exact:true}).click();
  await expect(page.getByRole('textbox',{name:kind==='note'?'Note text':'Task text',exact:true})).toHaveValue('');
  await saveText(page,kind==='note'?'Note':'Task',text);
  await expect(page.getByRole('button',{name:`Open linked ${kind}: ${text}`,exact:true})).toBeVisible();
}
async function addSubtask(page:Page,text:string) {
  await page.getByRole('button',{name:'Add subtask',exact:true}).click();
  await saveText(page,'Subtask',text);
  await expect(page.getByRole('button',{name:`Open subtask: ${text}`,exact:true})).toBeVisible();
}
async function removeTask(page:Page,subtask=false) {
  await page.getByRole('button',{name:'More task actions',exact:true}).click();
  await page.getByRole('button',{name:subtask?'Remove subtask':'Remove task',exact:true}).click();
}

test('writing-first Note detail supports explicit edit/cancel, copy, original capture and Remove/Undo',async({session})=>{
  const {page}=session;
  await capture(page,'note','Original words');await open(page,'note','Original words');
  await expect(page.getByTestId('task-sheet')).toHaveCount(0);
  await page.getByRole('button',{name:'Edit note',exact:true}).click();
  await page.getByRole('textbox',{name:'Note text',exact:true}).fill('Discarded edit');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByText('Original words',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit note',exact:true}).click();await saveText(page,'Note','Edited words');
  await page.getByRole('button',{name:'More note actions',exact:true}).click();
  await page.getByRole('button',{name:'View original capture',exact:true}).click();
  await expect(page.getByText('Original words',{exact:true})).toBeVisible();
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button',{name:'More note actions',exact:true}).click();await page.getByRole('button',{name:'Copy',exact:true}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Edited words');
  await page.getByRole('button',{name:'More note actions',exact:true}).click();await page.getByRole('button',{name:'Remove note',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open note: Edited words',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open note: Edited words',exact:true})).toBeVisible();
});

test('Note creates linked Notes and root Tasks; task source navigation is read-only with frozen provenance',async({session})=>{
  const {page}=session;
  await capture(page,'note','Source Note');await open(page,'note','Source Note');
  await link(page,'note','Independent Note');await link(page,'task','Linked root Task');
  await expect(page.getByText('Linked notes',{exact:true})).toBeVisible();await expect(page.getByText('Linked tasks',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit note',exact:true}).click();await saveText(page,'Note','Later source');
  await page.getByRole('button',{name:'Open linked task: Linked root Task',exact:true}).click();
  await expect(page.getByTestId('task-sheet')).toBeVisible();
  await expect(page.getByRole('button',{name:/^Under:/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Add linked entry',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^(Link note|Link task|New linked)/})).toHaveCount(0);
  await expect(page.getByText('Source Note',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View source Note',exact:true}).click();
  await expect(page.getByText('Later source',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit note',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Add linked entry',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByTestId('task-sheet')).toBeVisible();
  await addSubtask(page,'Child of linked task');
  await page.getByRole('button',{name:'Close task',exact:true}).click();
  await page.getByRole('button',{name:'More note actions',exact:true}).click();await page.getByRole('button',{name:'Remove note',exact:true}).click();
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();await open(page,'task','Linked root Task');
  await expect(page.getByText('Source Note',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open subtask: Child of linked task',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View source Note',exact:true}).click();await expect(page.getByText('Later source',{exact:true})).toBeVisible();
});

test('standalone task sheet, direct checkbox, one-level Subtasks and independent completion persist through restart',async({session})=>{
  let {page}=session;
  await capture(page,'task','Build prototype');
  await page.getByRole('checkbox',{name:'Complete task: Build prototype',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Reopen task: Build prototype',exact:true})).toBeChecked();
  await expect(page.getByTestId('task-sheet')).toHaveCount(0);
  await open(page,'task','Build prototype');await expect(page.getByRole('button',{name:'View source Note',exact:true})).toHaveCount(0);
  await addSubtask(page,'Paper sketch');await addSubtask(page,'Write code');
  await page.getByRole('checkbox',{name:'Complete subtask: Paper sketch',exact:true}).click();
  await page.getByRole('button',{name:'Open subtask: Write code',exact:true}).click();
  await expect(page.getByRole('button',{name:'Add subtask',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Under: Build prototype',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit subtask',exact:true}).click();await saveText(page,'Subtask','Implement offline');
  await page.getByRole('button',{name:'Back to task',exact:true}).click();
  await page.getByRole('button',{name:'Dismiss task sheet',exact:true}).click();
  await expect(page.getByText('1/2 subtasks',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open task: Implement offline',exact:true})).toHaveCount(0);
  page=await session.restart();await page.getByRole('tab',{name:'Tasks',exact:true}).click();await open(page,'task','Build prototype');
  await page.context().setOffline(true);
  await expect(page.getByRole('checkbox',{name:'Reopen task',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Reopen subtask: Paper sketch',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Complete subtask: Implement offline',exact:true})).not.toBeChecked();
});

test('search matches a Subtask, identifies its parent and opens that parent with the matching row visible',async({session})=>{
  const {page}=session;
  await capture(page,'task','Parent project');await open(page,'task','Parent project');
  for(let i=0;i<10;i++)await addSubtask(page,i===9?'Unique needle':'Step '+i);
  await page.getByRole('button',{name:'Close task',exact:true}).click();
  await page.getByRole('textbox',{name:'Search tasks'}).fill('Unique');
  await expect(page.getByText('Under: Parent project',{exact:true})).toBeVisible();
  await open(page,'task','Unique needle');
  await expect(page.getByRole('heading',{name:'Parent project',exact:true})).toBeAttached();
  await expect(page.getByRole('button',{name:'Open subtask: Unique needle',exact:true})).toBeInViewport();
});

test('parent and child removals are independent; Parent removed fallback regroups after Undo',async({session})=>{
  const {page}=session;
  await capture(page,'task','Keep hierarchy');await open(page,'task','Keep hierarchy');await addSubtask(page,'Surviving child');
  await page.getByRole('button',{name:'Open subtask: Surviving child',exact:true}).click();await removeTask(page,true);
  await expect(page.getByRole('button',{name:'Open subtask: Surviving child',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open subtask: Surviving child',exact:true})).toBeVisible();
  await removeTask(page);
  await expect(page.getByText('Parent removed',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open task: Surviving child',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open task: Surviving child',exact:true})).toHaveCount(0);
  await open(page,'task','Keep hierarchy');await expect(page.getByRole('button',{name:'Open subtask: Surviving child',exact:true})).toBeVisible();
});

test('outside tap, swipe and Escape retain unsaved Task/Subtask drafts until explicit Cancel or Save',async({session})=>{
  let {page}=session;
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();await page.getByRole('button',{name:'Add task',exact:true}).click();
  await page.getByRole('textbox',{name:'Task text',exact:true}).fill('Retained draft');
  await page.getByRole('button',{name:'Dismiss task sheet',exact:true}).click();
  await expect(page.getByTestId('task-sheet')).toHaveCount(0);
  page=await session.restart();await page.getByRole('button',{name:'Resume draft',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Task text',exact:true})).toHaveValue('Retained draft');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByTestId('task-sheet')).toHaveCount(0);
  await page.getByRole('button',{name:'Resume draft',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  const handle=page.getByRole('button',{name:'Expand task sheet',exact:true});const bounds=await handle.boundingBox();
  if(!bounds)throw Error('Missing handle');
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+12);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+105,{steps:8});await page.mouse.up();
  await expect(page.getByTestId('task-sheet')).toHaveCount(0);await page.getByRole('button',{name:'Resume draft',exact:true}).click();
  await saveText(page,'Task','Retained draft');
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();await open(page,'task','Retained draft');
  await page.getByRole('button',{name:'Add subtask',exact:true}).click();await page.getByRole('textbox',{name:'Subtask text',exact:true}).fill('Cancelled child');
  await page.getByRole('button',{name:'Dismiss task sheet',exact:true}).click();await page.getByRole('button',{name:'Resume draft',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Subtask text',exact:true})).toHaveValue('Cancelled child');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Open subtask: Cancelled child',exact:true})).toHaveCount(0);
});

test.describe('preservation and error recovery against real SQLite',()=>{
  test.use({observeSQLite:true});
  for(const version of [6,7])test(`populated v${version} upgrade retains legacy source navigation and no implicit hierarchy`,async({session})=>{
    let {page}=session;
    const fixture=await readFile(join(process.cwd(),`tests/fixtures/schema-v${version}-populated.sql`),'utf8');
    await databaseSQL(page,`PRAGMA foreign_keys=OFF; DROP TABLE entry_sources; DROP TABLE thinking_links; DROP TABLE task_sources; DROP TABLE today_selection; DROP TABLE scheduled_pins; DROP TABLE reminders; DROP TABLE tasks; DROP TABLE entries; ${fixture}`);
    page=await session.restart();
    await expect(page.getByRole('button',{name:'Open note: A reflection kept as a note',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Tasks',exact:true}).click();
    await expect(page.getByRole('button',{name:'Open task: Task from task',exact:true})).toBeVisible();
    if(version===7){
      await expect(page.getByRole('button',{name:'Open task: V7 legacy task-sourced task',exact:true})).toBeVisible();
      await open(page,'task','V7 note-linked task');await expect(page.getByRole('button',{name:'View source Note',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:/^Under:/})).toHaveCount(0);
      await page.getByRole('button',{name:'Close task',exact:true}).click();
      await open(page,'task','V7 legacy task-sourced task');await expect(page.getByRole('button',{name:'View legacy source',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'Open subtask: V7 legacy task-sourced task',exact:true})).toHaveCount(0);
    }
    await expect(page.getByRole('button',{name:'Add linked entry',exact:true})).toHaveCount(0);
  });
  test('failed linked Task and Subtask writes retain words and retry once with no duplicates',async({session})=>{
    const {page}=session;
    await capture(page,'note','Parent note');await open(page,'note','Parent note');
    await databaseSQL(page,"CREATE TRIGGER fail_link BEFORE INSERT ON entry_sources BEGIN SELECT RAISE(ABORT,'Injected link failure'); END;");
    await page.getByRole('button',{name:'Add linked entry',exact:true}).click();await page.getByRole('button',{name:'New linked task',exact:true}).click();
    await page.getByRole('textbox',{name:'Task text',exact:true}).fill('Keep these words');await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Your words are still here');
    await expect(page.getByRole('textbox',{name:'Task text',exact:true})).toHaveValue('Keep these words');
    await databaseSQL(page,'DROP TRIGGER fail_link;');await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('button',{name:'Open linked task: Keep these words',exact:true}).click();
    await databaseSQL(page,"CREATE TRIGGER fail_sub BEFORE INSERT ON tasks WHEN NEW.parent_task_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'Injected subtask failure'); END;");
    await page.getByRole('button',{name:'Add subtask',exact:true}).click();await page.getByRole('textbox',{name:'Subtask text',exact:true}).fill('Retry child');await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Your words are still here');
    await databaseSQL(page,'DROP TRIGGER fail_sub;');await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('button',{name:'Open subtask: Retry child',exact:true})).toHaveCount(1);
  });
});

test('system theme, sheet expansion and 320px large text keep controls usable with exactly two tabs',async({session})=>{
  const {page}=session;await page.setViewportSize({width:320,height:740});await page.emulateMedia({colorScheme:'dark'});
  await expect(page.getByRole('textbox',{name:'Search notes'})).toHaveCSS('color','rgb(239, 239, 239)');await page.emulateMedia({colorScheme:'light'});
  await expect(page.getByRole('tab')).toHaveCount(2);
  await capture(page,'task','A long task title with a little room to think');await open(page,'task','A long task title with a little room to think');
  const before=await page.getByTestId('task-sheet').boundingBox();await page.getByRole('button',{name:'Expand task sheet',exact:true}).click();
  expect((await page.getByTestId('task-sheet').boundingBox())!.height).toBeGreaterThan(before!.height);
  await page.addStyleTag({content:'[dir="auto"] {font-size: 24px !important;}'});
  await expect(page.getByRole('button',{name:'Add subtask',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit task',exact:true})).toBeVisible();
  const edit=await page.getByRole('button',{name:'Edit task',exact:true}).boundingBox();expect(edit!.width).toBeGreaterThanOrEqual(44);expect(edit!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'Close task',exact:true}).click();
  for(const name of ['Today','Review','Library','Settings','Pin','Link note','Link task'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
});
