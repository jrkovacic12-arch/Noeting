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

async function capture(page:Page,kind:'note'|'task',text:string){
  await page.getByRole('tab',{name:kind==='note'?'Notes':'Tasks',exact:true}).click();
  await page.getByRole('button',{name:`Add ${kind}`,exact:true}).click();
  await page.getByRole('textbox',{name:kind==='note'?'Note text':'Task text',exact:true}).fill(text);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:`Open ${kind}: ${text}`,exact:true})).toBeVisible();
}
async function open(page:Page,kind:'note'|'task',text:string){await page.getByRole('button',{name:`Open ${kind}: ${text}`,exact:true}).click();}
async function link(page:Page,kind:'note'|'task',text:string){
  await page.getByRole('button',{name:`Link ${kind}`,exact:true}).click();
  await page.getByRole('textbox',{name:kind==='note'?'Note text':'Task text',exact:true}).fill(text);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:`${kind==='note'?'Note':'Task'}: ${text}`,exact:true})).toBeVisible();
}

test('two searchable tabs capture offline and persist independent completion through restart',async({session})=>{
  let {page}=session;
  await expect(page.getByRole('tab')).toHaveCount(2);
  for(const name of ['Today','Review','Library','Settings','Reflect','Creation','Pin'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await page.context().setOffline(true);
  await capture(page,'note','A quiet thought');
  await capture(page,'note','Another thought');
  await page.getByRole('textbox',{name:'Search notes'}).fill('quiet');
  await expect(page.getByRole('button',{name:'Open note: Another thought',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Open note: A quiet thought',exact:true})).toBeVisible();
  await capture(page,'task','Take a walk');
  await page.getByRole('checkbox',{name:'Complete task: Take a walk',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Reopen task: Take a walk',exact:true})).toBeChecked();
  await page.getByRole('textbox',{name:'Search tasks'}).fill('absent');
  await expect(page.getByText('No matches',{exact:true})).toBeVisible();
  await page.context().setOffline(false);page=await session.restart();
  await expect(page.getByRole('button',{name:'Open note: A quiet thought',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();
  await page.getByRole('checkbox',{name:'Reopen task: Take a walk',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Complete task: Take a walk',exact:true})).not.toBeChecked();
});

test('both entry types create both child types only in details and keep removed-source provenance',async({session})=>{
  const {page}=session;
  for(const kind of ['note','task'] as const){
    await capture(page,kind,`Parent ${kind}`);
    await expect(page.getByRole('button',{name:'Link note',exact:true})).toHaveCount(0);
    await open(page,kind,`Parent ${kind}`);
    await page.getByRole('button',{name:'Link note',exact:true}).click();
    await page.getByRole('textbox',{name:'Note text',exact:true}).fill('Cancelled words');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(page.getByRole('button',{name:'Note: Cancelled words',exact:true})).toHaveCount(0);
    await link(page,'note',`Child note of ${kind}`);await link(page,'task',`Child task of ${kind}`);
    if(kind==='task')await page.getByRole('button',{name:'Complete task',exact:true}).click();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByRole('textbox',{name:kind==='note'?'Note text':'Task text',exact:true}).fill('Later parent');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('button',{name:`Note: Child note of ${kind}`,exact:true}).click();
    await expect(page.getByText(`Parent ${kind}`,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Open source',exact:true}).click();
    await page.getByRole('button',{name:'Remove',exact:true}).click();
    await expect(page.getByText('Later parent',{exact:true})).toHaveCount(0);
    // Removal returns to the independent child that opened the parent.
    await expect(page.getByRole('button',{name:'Open removed source',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Open removed source',exact:true}).click();
    await expect(page.getByText('Later parent',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.getByRole('tab',{name:'Tasks',exact:true}).click();
    await expect(page.getByRole('checkbox',{name:`Complete task: Child task of ${kind}`,exact:true})).not.toBeChecked();
  }
});

test.describe('real SQLite upgrade and failure workflows',()=>{
  test.use({observeSQLite:true});
  test('populated v6 upgrades without lost legacy notes or source navigation',async({session})=>{
    let {page}=session;
    const fixture=await readFile(join(process.cwd(),'tests/fixtures/schema-v6-populated.sql'),'utf8');
    await databaseSQL(page,`PRAGMA foreign_keys=OFF; DROP TABLE entry_sources; DROP TABLE thinking_links; DROP TABLE task_sources; DROP TABLE today_selection; DROP TABLE scheduled_pins; DROP TABLE reminders; DROP TABLE tasks; DROP TABLE entries; ${fixture}`);
    page=await session.restart();
    await expect(page.getByRole('button',{name:'Open note: A reflection kept as a note',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open note: A creation kept as a note',exact:true})).toBeVisible();
    await open(page,'note','A reflection kept as a note');
    await page.getByRole('button',{name:'Open removed source',exact:true}).click();
    await expect(page.getByText('Edited legacy note',{exact:true})).toBeVisible();
    await expect(page.getByText('  Original note\nkept exactly.  ',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.getByRole('tab',{name:'Tasks',exact:true}).click();
    await expect(page.getByRole('checkbox',{name:'Reopen task: Independent child task',exact:true})).toBeChecked();
  });
  test('failed save retains text and retries once; edit, removal and Undo stay consistent',async({session})=>{
    const {page}=session;
    await capture(page,'note','Parent');await open(page,'note','Parent');
    await databaseSQL(page,"CREATE TRIGGER fail_link BEFORE INSERT ON entry_sources BEGIN SELECT RAISE(ABORT,'Injected failure'); END;");
    await page.getByRole('button',{name:'Link task',exact:true}).click();
    await page.getByRole('textbox',{name:'Task text',exact:true}).fill('Keep these words');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Your words are still here');
    await expect(page.getByRole('textbox',{name:'Task text',exact:true})).toHaveValue('Keep these words');
    await databaseSQL(page,'DROP TRIGGER fail_link;');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('button',{name:'Task: Keep these words',exact:true})).toHaveCount(1);
    await page.getByRole('button',{name:'Task: Keep these words',exact:true}).click();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByRole('textbox',{name:'Task text',exact:true}).fill('Changed words');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByText('Keep these words',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Remove',exact:true}).click();
    await expect(page.getByRole('button',{name:'Task: Changed words',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    await expect(page.getByRole('button',{name:'Task: Changed words',exact:true})).toBeVisible();
  });
});

test('system theme, narrow layout and large text retain usable controls',async({session})=>{
  const {page}=session;
  await page.setViewportSize({width:320,height:740});
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.getByRole('textbox',{name:'Search notes'})).toHaveCSS('color','rgb(239, 239, 239)');
  await page.emulateMedia({colorScheme:'light'});
  await capture(page,'note','Words that deserve some room. '.repeat(25));
  await page.getByRole('button',{name:/^Open note:/}).click();
  await page.addStyleTag({content:'[dir="auto"] {font-size: 24px !important;}'});
  await expect(page.getByRole('button',{name:'Link note',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Link task',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
