import { chromium, expect, test as base, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
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
      await expect(page.getByRole('heading', { name: 'Make room for what matters' })).toBeVisible();
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

async function showBars(page: Page) {
  await page.getByTestId('main-scroll').evaluate(element => { element.scrollTop = 0; });
  await expect(page.getByTestId('bottom-bar')).not.toHaveAttribute('aria-hidden', 'true');
}
async function navigate(page: Page, name: string) {
  await showBars(page);
  await page.getByRole('tab', { name, exact: true }).click();
}

async function capture(page: Page, kind: 'Note' | 'Task', text: string) {
  await showBars(page);
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('radio', { name: kind, exact: true }).click();
  await page.getByRole('textbox', { name: 'Capture text', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Capture text', exact: true })).toBeHidden();
}

async function linkedAction(page: Page, scope: Locator, action: string) {
  await scope.getByRole('button',{name:/^Linked actions:/}).first().click();
  await expect(page.getByRole('dialog').last().getByRole('button')).toHaveCount(3);
  await page.getByRole('dialog').last().getByRole('button',{name:action,exact:true}).click();
}

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

test('Library retrieves exact original words after restart and filters offline', async ({ session }) => {
  let page = session.page;
  const original = '  A quiet thought\nabout tomorrow. 🌿  ';
  await capture(page, 'Note', original);
  await capture(page, 'Task', '  Prepare tomorrow  ');
  await page.getByRole('button', { name: 'Complete Prepare tomorrow', exact: true }).click();
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();
  page = await session.restart();
  await navigate(page, 'Library');
  await expect(page.getByRole('heading', { name: 'Your saved words' })).toBeVisible();
  await expect(page.getByTestId(/^original-/)).toHaveCount(2);
  expect(await page.getByTestId(/^original-/).allTextContents()).toEqual(['  Prepare tomorrow  ', original]);
  await expect(page.getByText('TASK · Completed', { exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole('radio', { name: 'Notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search saved entries' }).fill('QUIET');
  await expect(page.getByTestId(/^original-/)).toHaveCount(1);
  expect(await page.getByTestId(/^original-/).textContent()).toBe(original);
  await page.getByRole('radio', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('No entries match your search and filters.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search saved entries' }).fill('');
  await page.getByRole('radio', { name: 'All', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear search and filters' })).toHaveCount(0);
  await expect(page.getByTestId(/^original-/)).toHaveCount(2);
  await navigate(page, 'Today');
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();
  await expect(page.getByTestId('daily-summary')).toBeVisible();
});

test('Library keeps one Capture entry point, Review exists, and stop controls are removed', async ({ session }) => {
  const page = session.page;
  await navigate(page, 'Library');
  await expect(page.getByText('No saved entries yet. Capture a thought when one appears.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toHaveCount(1);
  await capture(page, 'Note', 'Find 100% of my words');
  await page.getByRole('textbox', { name: 'Search saved entries' }).fill('100%');
  await expect(page.getByTestId(/^original-/)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Finish session', exact: true })).toHaveCount(0);
  await expect(page.getByText('Enough for today.', {exact:true})).toHaveCount(0);
  await navigate(page, 'Review');
  await expect(page.getByRole('heading', { name: 'Review what actually happened' })).toBeVisible();
  await expect(page.getByText('No completed tasks yet.', {exact:true})).toBeVisible();
  await navigate(page, 'Today');
  await expect(page.getByTestId('daily-summary')).toContainText('0 open · 0 completed · 1 saved entries');
});

test('notes, tasks, pins, and completion survive a full browser restart', async ({ session }) => {
  let page = session.page;
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();
  await capture(page, 'Note', 'A durable local note\nwith a second line.');
  await expect(page.getByTestId('daily-summary')).toBeVisible();
  await capture(page, 'Task', 'Prepare tomorrow');
  await page.getByRole('button', { name: 'Pin Prepare tomorrow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpin Prepare tomorrow', exact: true })).toBeVisible();

  page = await session.restart();
  await expect(page.getByTestId('daily-summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpin Prepare tomorrow', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete Prepare tomorrow', exact: true }).click();
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();

  page = await session.restart();
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();
  await expect(page.getByTestId('daily-summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete Prepare tomorrow', exact: true })).toHaveCount(0);
});

test('pins are unlimited, latest pins lead and completing a task clears its pin', async ({ session }) => {
  let page = session.page;
  for (const title of ['First focus', 'Second focus', 'Third focus', 'Fourth focus']) {
    await capture(page, 'Task', title);
  }
  await page.getByRole('button', { name: 'Pin Third focus', exact: true }).click();
  await expect.poll(async () => page.getByRole('button', { name: /^Complete / }).evaluateAll(
    (buttons) => buttons.map((button) => button.getAttribute('aria-label')),
  )).toEqual(['Complete Third focus', 'Complete First focus', 'Complete Second focus', 'Complete Fourth focus']);
  for (const title of ['First focus', 'Second focus']) {
    await page.getByRole('button', { name: `Pin ${title}`, exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Pin Fourth focus', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Pin Fourth focus', exact: true }).click();
  await expect.poll(async()=>page.getByRole('button',{name:/^Complete /}).evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-label')))).toEqual(['Complete Fourth focus','Complete Second focus','Complete First focus','Complete Third focus']);
  await page.getByRole('button', { name: 'Complete Second focus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpin Fourth focus', exact: true })).toBeVisible();

  page = await session.restart();
  for (const title of ['First focus', 'Third focus', 'Fourth focus']) {
    await expect(page.getByRole('button', { name: `Unpin ${title}`, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Complete ${title}`, exact: true })).toHaveCount(1);
  }
  await expect(page.getByRole('button', { name: 'Complete Second focus', exact: true })).toHaveCount(0);
});

test('loaded app captures offline and a rapid save submits only once', async ({ session }) => {
  const page = session.page;
  await page.context().setOffline(true);
  const addTask=page.getByRole('button', { name: 'Add task', exact: true });
  expect(await addTask.textContent()).toBe('');
  const bounds=await addTask.boundingBox();expect(bounds!.width).toBeGreaterThanOrEqual(44);expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await addTask.click();
  await expect(page.getByRole('radio',{name:'Task',exact:true})).toHaveAttribute('aria-checked','true');
  const input = page.getByRole('textbox', { name: 'Capture text', exact: true });
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await input.fill('   ');
  await expect(save).toBeDisabled();
  await input.fill('Offline capture');
  await save.dblclick();
  await expect(input).toBeHidden();
  await expect(page.getByRole('button', { name: 'Complete Offline capture', exact: true })).toHaveCount(1);

  // Web has no offline shell guarantee; restore networking before loading assets.
  await page.context().setOffline(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Complete Offline capture', exact: true })).toHaveCount(1);
});

test('a competing browser tab fails safely and retries after the database owner closes', async ({ session }) => {
  const owner = session.page;
  await capture(owner, 'Task', 'Retain data after storage contention');
  const competing = await owner.context().newPage();
  await competing.goto('/');
  await expect(competing.getByRole('alert')).toContainText('Could not open local storage');
  await expect(competing.getByRole('alert')).toContainText('Your data has not been cleared');

  await owner.close();
  await competing.getByRole('button', { name: 'Retry opening storage', exact: true }).click();
  await expect(competing.getByRole('heading', { name: 'Make room for what matters' })).toBeVisible();
  await expect(competing.getByRole('button', { name: 'Complete Retain data after storage contention', exact: true })).toHaveCount(1);
});

test.describe('real SQLite write failure', () => {
  test.use({ observeSQLite: true });

  test('failed linked write keeps the draft and retry persists only one task', async ({ session }) => {
    let page = session.page;
    await databaseSQL(page, `
      CREATE TEMP TRIGGER noeting_test_write_failure BEFORE INSERT ON tasks
      BEGIN SELECT RAISE(ABORT, 'Injected real SQLite write failure'); END;
    `);
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Capture text', exact: true });
    const original = 'Keep this draft\nand its second line.';
    await input.fill(original);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Could not confirm the save');
    await expect(input).toHaveValue(original);
    await expect(page.getByRole('radio', { name: 'Task', exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    await databaseSQL(page, 'DROP TRIGGER noeting_test_write_failure;');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(input).toBeHidden();
    await expect(page.getByRole('button', { name: /^Complete Keep this draft/ })).toHaveCount(1);
    page = await session.restart();
    await expect(page.getByRole('button', { name: /^Complete Keep this draft/ })).toHaveCount(1);
    await expect(page.getByTestId('daily-summary')).toBeVisible();
  });
});


test('prototype Today note / Reflect / Create / Review survive restart without changing the source', async ({session}) => {
  let page = session.page;
  const original = '  A thought worth revisiting\nwith a second line. 🌿  ';
  await capture(page,'Note',original);
  await capture(page,'Task','Finish a real task');
  await page.getByRole('button',{name:'Pin Finish a real task',exact:true}).click();
  const pin = page.getByRole('button',{name:'Unpin Finish a real task',exact:true});
  await expect(pin).toHaveAttribute('aria-pressed','true');
  const row = page.getByTestId(/^task-/);
  const title = await row.getByText('Finish a real task',{exact:true}).boundingBox();
  const icon = await pin.boundingBox();
  expect(icon!.x).toBeGreaterThanOrEqual(title!.x + title!.width);
  await page.getByRole('button',{name:'Complete Finish a real task',exact:true}).click();
  await expect(page.getByText('No pending tasks',{exact:true})).toBeVisible();
  // A direct Note capture now selects it atomically.
  expect(await page.getByTestId('chosen-note-text').textContent()).toBe(original);
  await expect(page.getByTestId('daily-summary')).toContainText('0 open · 1 completed · 2 saved entries');
  const thinking = page.getByTestId('today-thinking');
  await linkedAction(page,thinking,'Reflect');
  await page.getByRole('textbox',{name:'Linked entry text',exact:true}).fill('  My thinking changed.  ');
  await page.context().setOffline(true);
  await page.getByRole('button',{name:'Save',exact:true}).dblclick();
  await expect(page.getByRole('textbox',{name:'Linked entry text',exact:true})).toBeHidden();
  await linkedAction(page,thinking,'Create');
  await page.getByRole('textbox',{name:'Linked entry text',exact:true}).fill('An original essay idea');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Linked entry text',exact:true})).toBeHidden();
  expect(await page.getByTestId('chosen-note-text').textContent()).toBe(original);
  await expect(page.getByTestId('daily-summary')).toContainText('0 open · 1 completed · 4 saved entries');
  await navigate(page, 'Review');
  await expect(page.getByTestId('task-review')).toContainText('Finish a real task');
  await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(2);
  await expect(page.getByTestId(/^entry-/).filter({visible:true}).filter({hasText:'My thinking changed.'})).toContainText('ORIGINAL · UNCHANGED');
  await page.context().setOffline(false);
  page = await session.restart();
  expect(await page.getByTestId('chosen-note-text').textContent()).toBe(original);
  await navigate(page, 'Review');
  await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(2);
  await expect(page.getByTestId('task-review')).toContainText('Finish a real task');
  await navigate(page, 'Library');
  const cards = page.getByTestId(/^entry-/).filter({visible:true});
  await expect(cards).toHaveCount(4);
  const source = cards.filter({has:page.getByTestId(/^original-/).filter({hasText:'A thought worth revisiting'})});
  await expect(source).toHaveCount(1);
  expect(await source.getByTestId(/^original-/).textContent()).toBe(original);
  await source.getByRole('button',{name:/^Choose as Today note:/}).click();
  await navigate(page,'Today');
  await page.getByRole('button',{name:'Change',exact:true}).click();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  expect(await page.getByTestId('chosen-note-text').textContent()).toBe(original);
});

test.describe('real linked-entry failure', () => {
  test.use({observeSQLite:true});
  test('a failed Reflect save keeps its draft/source and retries once', async ({session}) => {
    const page=session.page;
    await capture(page,'Note','Immutable source');
    // A direct Note capture now selects it atomically.
    await databaseSQL(page, "CREATE TEMP TRIGGER noeting_link_failure BEFORE INSERT ON thinking_links BEGIN SELECT RAISE(ABORT,'Injected linked failure'); END;");
    await linkedAction(page,page.getByTestId('today-thinking'),'Reflect');
    const input=page.getByRole('textbox',{name:'Linked entry text',exact:true});
    await input.fill('Retain this reflection');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Could not confirm the save');
    await expect(input).toHaveValue('Retain this reflection');
    await databaseSQL(page,'DROP TRIGGER noeting_link_failure;');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(input).toBeHidden();
    await expect(page.getByTestId('daily-summary')).toContainText('2 saved entries');
    await navigate(page, 'Review');
    await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(1);
    await expect(page.getByTestId(/^entry-/).filter({visible:true})).toContainText('Immutable source');
  });
});

async function longPress(page: Page, locator: ReturnType<Page['getByRole']>) {
  await locator.scrollIntoViewIfNeeded();
  const box=await locator.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down();await page.waitForTimeout(600);await page.mouse.up();
  await expect(page.getByRole('button',{name:'Copy',exact:true})).toBeVisible();
}

test('Today note auto-selection, entry copy/edit/remove and Undo survive restart', async ({session}) => {
  let page=session.page;
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await capture(page,'Note','  New Today note 🌿  ');
  await expect(page.getByTestId('chosen-note-text')).toHaveText('New Today note 🌿');
  await page.getByRole('button',{name:'Open entry:   New Today note 🌿  ',exact:true}).click();
  await page.getByRole('button',{name:'Copy entry',exact:true}).click();
  await page.getByRole('button',{name:'Back to previous view',exact:true}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('  New Today note 🌿  ');
  await page.getByRole('button',{name:'Edit note:   New Today note 🌿  ',exact:true}).click();
  await page.getByRole('textbox',{name:'Edit entry text',exact:true}).fill('  Edited Today note\n🌿  ');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByTestId('chosen-note-text')).toHaveText('Edited Today note\n🌿');
  await navigate(page,'Library');
  await page.getByRole('textbox',{name:'Search saved entries'}).fill('Edited Today');
  await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(1);
  await navigate(page,'Today');
  await page.getByRole('button',{name:'Remove note:   Edited Today note\n🌿  ',exact:true}).click();
  await expect(page.getByTestId('chosen-note-text')).toHaveCount(0);
  await expect(page.getByTestId('daily-summary')).toContainText('0 saved entries');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByTestId('chosen-note-text')).toHaveText('Edited Today note\n🌿');
  page=await session.restart();
  expect(await page.getByTestId('chosen-note-text').textContent()).toBe('  Edited Today note\n🌿  ');
});

test('task edits/removal synchronize Today, Library and Review; removed source preserves linked original', async ({session}) => {
  let page=session.page;
  await capture(page,'Task','Original task');
  await longPress(page,page.getByRole('button',{name:'Open entry: Original task',exact:true}));
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('textbox',{name:'Edit entry text',exact:true}).fill('Edited task');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Complete Edited task',exact:true})).toBeVisible();
  await navigate(page,'Library');
  const task=page.getByTestId(/^entry-/).filter({visible:true});
  await expect(task.getByTestId(/^original-/)).toHaveText('Edited task');
  await linkedAction(page,task,'Reflect');
  await page.getByRole('textbox',{name:'Linked entry text',exact:true}).fill('Task reflection');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await navigate(page,'Today');
  await page.getByRole('button',{name:'Complete Edited task',exact:true}).click();
  await navigate(page,'Review');
  await page.getByRole('button',{name:'Remove completed task: Edited task',exact:true}).click();
  await expect(page.getByTestId('task-review')).toContainText('No completed tasks yet.');
  const reflection=page.getByTestId(/^entry-/).filter({visible:true});
  await expect(reflection).toContainText('Original task');
  await expect(reflection).toContainText('Removed');
  await reflection.getByRole('button',{name:'Edit reflection: Task reflection',exact:true}).click();
  await page.getByRole('textbox',{name:'Edit entry text',exact:true}).fill('Edited reflection');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(reflection).toContainText('Edited reflection');
  await expect(reflection).toContainText('Original task');
  await reflection.getByRole('button',{name:'Remove reflection: Edited reflection',exact:true}).click();
  await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(1);
  await navigate(page,'Library');await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(1);
  page=await session.restart();await navigate(page,'Review');
  await expect(page.getByTestId(/^entry-/).filter({visible:true})).toContainText('Edited reflection');
  await expect(page.getByTestId('task-review')).toContainText('No completed tasks yet.');
});

test('icon navigation hides both bars downward and restores them upward, at top and on tab changes', async ({session}) => {
  const page=session.page;
  await page.setViewportSize({width:360,height:640});
  await capture(page,'Task','A wrapped task that takes several lines on a narrow phone screen');
  const scroll=page.getByTestId('main-scroll');
  const top=page.getByTestId('top-bar');const bottom=page.getByTestId('bottom-bar');
  await expect(top).not.toContainText('Capture');
  expect(await page.getByRole('tab',{name:'Today',exact:true}).textContent()).toBe('');
  await scroll.evaluate(el=>{el.scrollTop=120;});
  await expect(top).toHaveAttribute('aria-hidden','true');
  await expect(bottom).toHaveAttribute('aria-hidden','true');
  await scroll.evaluate(el=>{el.scrollTop=80;});
  await expect(top).not.toHaveAttribute('aria-hidden','true');
  await expect(bottom).not.toHaveAttribute('aria-hidden','true');
  await navigate(page,'Library');await expect(bottom).not.toHaveAttribute('aria-hidden','true');
  await expect(page.getByRole('tab',{name:'Library',exact:true})).toHaveAttribute('aria-selected','true');
  await showBars(page);
  const plus=await page.getByRole('button',{name:'Capture',exact:true}).boundingBox();
  const bar=await bottom.boundingBox();
  expect(Math.abs(plus!.x+plus!.width/2-(bar!.x+bar!.width/2))).toBeLessThan(1);
  // Retain the actual native-host equivalents rather than rebuilding Library
  // when returning from Review (both tab navigation and Android Back use restoreScreen).
  const scrollNode=await scroll.elementHandle();
  const libraryNode=await page.getByTestId('screen-library').elementHandle();
  const cardNode=await page.getByTestId(/^entry-/).filter({visible:true}).first().elementHandle();
  await page.getByRole('textbox',{name:'Search saved entries'}).fill('wrapped');
  await navigate(page,'Review');
  await expect(page.getByTestId('screen-library')).toBeHidden();
  await expect(page.getByRole('textbox',{name:'Search saved entries'})).toBeHidden();
  await navigate(page,'Library');
  await expect(page.getByRole('textbox',{name:'Search saved entries'})).toHaveValue('wrapped');
  expect(await scrollNode!.evaluate(node=>node===document.querySelector('[data-testid="main-scroll"]'))).toBe(true);
  expect(await libraryNode!.evaluate(node=>node===document.querySelector('[data-testid="screen-library"]'))).toBe(true);
  expect(await cardNode!.evaluate(node=>node.isConnected)).toBe(true);
  await page.screenshot({path:'artifacts/ui-v033/library-navigation.png'});
});


test('bottom sheet has three rows and dismisses outside; forms retain separate session drafts', async ({session}) => {
  const page=session.page;
  await capture(page,'Note','Sheet source');
  await capture(page,'Task','Sheet task');
  const note=page.getByRole('button',{name:'Open entry: Sheet task',exact:true});
  await page.evaluate(()=>{
    const observer=new MutationObserver(()=>{
      const overlay=document.querySelector('[data-testid="dialog-overlay"]');
      const motion=document.querySelector('[data-testid="toolbox-motion"]');
      if(!overlay || !motion)return;
      const rect=overlay.getBoundingClientRect();
      (window as Window & {sheetOpening?:unknown}).sheetOpening={top:rect.top,height:rect.height,background:getComputedStyle(overlay).backgroundColor};
      observer.disconnect();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });
  const bounds=await note.boundingBox();
  await page.mouse.move(bounds!.x+20,bounds!.y+15);await page.mouse.down();
  await page.waitForTimeout(340);
  await expect(page.getByRole('dialog').last()).toBeVisible();await page.mouse.up();
  const opening=await page.evaluate(()=>(window as Window & {sheetOpening?:{top:number;height:number;background:string}}).sheetOpening);
  expect(opening).toEqual({top:0,height:900,background:'rgba(16, 35, 27, 0.4)'});
  const sheet=page.getByRole('dialog').last();
  await expect(sheet).toHaveText('CopyEditRemove');
  await expect(sheet.getByRole('button',{name:/^(Copy|Edit|Remove)$/})).toHaveCount(3);
  await expect.poll(async()=>{const box=await sheet.boundingBox();return Math.round(box!.y+box!.height);}).toBe(900);
  await page.screenshot({path:'artifacts/ui-v033/toolbox.png'});
  await page.getByTestId('dialog-backdrop').click({position:{x:10,y:10}});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await showBars(page);await page.getByRole('button',{name:'Capture',exact:true}).click();
  const input=page.getByRole('textbox',{name:'Capture text',exact:true});
  await input.fill('Unsaved note draft');
  await page.getByRole('radio',{name:'Task',exact:true}).click();await input.fill('Unsaved task draft');
  await page.getByTestId('dialog-backdrop').click({position:{x:10,y:10}});
  await expect(input).toBeHidden();
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  await expect(input).toHaveValue('Unsaved note draft');
  await page.getByRole('radio',{name:'Task',exact:true}).click();await expect(input).toHaveValue('Unsaved task draft');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Complete Unsaved task draft',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  await expect(input).toHaveValue('Unsaved note draft');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByTestId('chosen-note-text')).toHaveText('Unsaved note draft');
  await page.getByRole('button',{name:'Capture',exact:true}).click();await expect(input).toHaveValue('');
});

test('compact centered Undo swipes down without restoring the removed note', async ({session}) => {
  const page=session.page;
  await capture(page,'Note','Swipe removal');
  await page.getByRole('button',{name:'Remove note: Swipe removal',exact:true}).click();
  const undo=page.getByTestId('undo-message');await expect(undo).toHaveText('Undo');
  const box=await undo.boundingBox();expect(Math.abs(box!.x+box!.width/2-215)).toBeLessThan(1);expect(box!.width).toBeLessThan(110);
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2+48,{steps:8});await page.mouse.up();
  await expect(undo).toBeHidden();await navigate(page,'Library');await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(0);
  const restarted=await session.restart();await navigate(restarted,'Library');await expect(restarted.getByTestId(/^entry-/)).toHaveCount(0);
});


test('theme overrides persist offline and system appearance updates live', async ({session})=>{
  let page=session.page;
  const shell=()=>page.getByTestId('app-shell');
  await page.emulateMedia({colorScheme:'light'});
  await navigate(page,'Settings');
  await expect(page.getByRole('radio',{name:'Same as system',exact:true})).toBeChecked();
  await expect(shell()).toHaveCSS('background-color','rgb(246, 247, 242)');
  await page.emulateMedia({colorScheme:'dark'});
  await expect(shell()).toHaveCSS('background-color','rgb(18, 26, 23)');
  await page.getByRole('radio',{name:'Light',exact:true}).click();
  await expect(page.getByText('Current appearance: Light',{exact:true})).toBeVisible();
  await expect(shell()).toHaveCSS('background-color','rgb(246, 247, 242)');
  await page.getByRole('radio',{name:'Dark',exact:true}).click();
  await expect(page.getByText('Current appearance: Dark',{exact:true})).toBeVisible();
  await page.emulateMedia({colorScheme:'light'});
  await expect(shell()).toHaveCSS('background-color','rgb(18, 26, 23)');
  await page.context().setOffline(true);
  await navigate(page,'Today');await capture(page,'Note','Theme survival note');
  await page.getByRole('button',{name:'Linked actions: Theme survival note',exact:true}).click();
  await expect(page.getByRole('dialog').last()).toHaveCSS('background-color','rgb(28, 40, 34)');
  await page.getByTestId('dialog-backdrop').click({position:{x:10,y:10}});
  await showBars(page);await page.getByRole('button',{name:'Capture',exact:true}).click();
  await expect(page.getByRole('dialog').last()).toHaveCSS('background-color','rgb(28, 40, 34)');
  await page.getByRole('button',{name:'Close capture',exact:true}).click();
  await navigate(page,'Library');await expect(page.getByTestId(/^original-/).filter({visible:true})).toHaveText('Theme survival note');
  await navigate(page,'Review');await expect(shell()).toHaveCSS('background-color','rgb(18, 26, 23)');
  await navigate(page,'Settings');await page.screenshot({path:'artifacts/ui-v040/settings-dark.png'});
  // Web cold-start offline isn't supported; retained profile still proves actual
  // SQLite settings and note durability after a full browser process restart.
  await page.context().setOffline(false);page=await session.restart();
  await expect(shell()).toHaveCSS('background-color','rgb(18, 26, 23)');
  await expect(page.getByTestId('chosen-note-text')).toHaveText('Theme survival note');
  await navigate(page,'Settings');await expect(page.getByRole('radio',{name:'Dark',exact:true})).toBeChecked();
  await page.getByRole('radio',{name:'Same as system',exact:true}).click();
  await expect(page.getByText('Current appearance: Light',{exact:true})).toBeVisible();
  await page.emulateMedia({colorScheme:'dark'});await expect(shell()).toHaveCSS('background-color','rgb(18, 26, 23)');
  await page.emulateMedia({colorScheme:'light'});await expect(shell()).toHaveCSS('background-color','rgb(246, 247, 242)');
  await page.setViewportSize({width:360,height:640});
  await page.screenshot({path:'artifacts/ui-v040/settings-light.png'});
  const bar=await page.getByTestId('bottom-bar').boundingBox();
  for(const name of ['Today','Library','Review','Settings']){
    const box=await page.getByRole('tab',{name,exact:true}).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(bar!.x);
    expect(box!.x+box!.width).toBeLessThanOrEqual(bar!.x+bar!.width);
  }
});


test.describe('appearance storage failures',()=>{
  test.use({observeSQLite:true});
  test('failed theme save restores the previous choice and retries without changing notes',async({session})=>{
    const page=session.page;
    await capture(page,'Note','Preserve through preference failure');
    await navigate(page,'Settings');
    await page.getByRole('radio',{name:'Light',exact:true}).click();
    await expect(page.getByText('Current appearance: Light',{exact:true})).toBeVisible();
    await databaseSQL(page,"CREATE TRIGGER fail_theme BEFORE UPDATE ON storage BEGIN SELECT RAISE(ABORT,'Theme save failed'); END;",true);
    await page.getByRole('radio',{name:'Dark',exact:true}).click();
    await expect(page.getByRole('alert')).toHaveText('Could not save your theme. Please try again.');
    await expect(page.getByRole('radio',{name:'Light',exact:true})).toBeChecked();
    await expect(page.getByTestId('app-shell')).toHaveCSS('background-color','rgb(246, 247, 242)');
    await databaseSQL(page,'DROP TRIGGER fail_theme;',true);
    await page.getByRole('radio',{name:'Dark',exact:true}).click();
    await expect(page.getByText('Current appearance: Dark',{exact:true})).toBeVisible();
    const restarted=await session.restart();
    await expect(restarted.getByTestId('app-shell')).toHaveCSS('background-color','rgb(18, 26, 23)');
    await expect(restarted.getByTestId('chosen-note-text')).toHaveText('Preserve through preference failure');
  });
});

test('reopen returns the same task to Today without Undo, confirmation or navigation', async ({session}) => {
  let page=session.page;
  await capture(page,'Task','Reopen me');
  await page.getByRole('button',{name:'Pin Reopen me',exact:true}).click();
  await page.getByRole('button',{name:'Complete Reopen me',exact:true}).click();
  await navigate(page,'Review');
  await page.getByRole('button',{name:'Reopen Reopen me',exact:true}).click();
  await expect(page.getByTestId('task-review')).not.toContainText('Reopen me');
  await expect(page.getByTestId('screen-review')).toBeVisible();
  await expect(page.getByTestId('undo-message')).toBeHidden();
  await expect(page.getByRole('dialog').last()).toBeHidden();
  await navigate(page,'Today');
  await expect(page.getByRole('button',{name:'Complete Reopen me',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Pin Reopen me',exact:true})).toBeVisible();
  page=await session.restart();
  await expect(page.getByRole('button',{name:'Complete Reopen me',exact:true})).toBeVisible();
  await navigate(page,'Library');
  await expect(page.getByTestId('screen-library')).toContainText('TASK · Pending');
});

test('note-derived tasks retain source text, independent edits and removed-note navigation across restart', async ({session}) => {
  let page=session.page;
  const note='  A note 🌿\nwith a possible action.  ';
  await capture(page,'Note',note);
  await linkedAction(page,page.getByTestId('today-thinking'),'New task');
  await expect(page.getByRole('textbox',{name:'New task text'})).toHaveValue(note);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Complete /})).toHaveCount(0);
  await linkedAction(page,page.getByTestId('today-thinking'),'New task');
  await page.getByRole('textbox',{name:'New task text'}).fill('Try one experiment');
  await page.getByRole('button',{name:'Save',exact:true}).dblclick();
  await expect(page.getByRole('textbox',{name:'New task text'})).toBeHidden();
  await expect(page.getByTestId('chosen-note-text')).toHaveText(note);
  await expect(page.getByRole('button',{name:'Complete Try one experiment',exact:true})).toHaveCount(1);
  await page.getByTestId('screen-today').getByRole('button',{name:'Open entry: Try one experiment',exact:true}).click();
  await page.getByTestId('screen-entry').getByRole('button',{name:'Open original note: Try one experiment',exact:true}).click();
  await expect(page.getByTestId('screen-entry')).toContainText(note.trim());
  await page.getByTestId('screen-entry').getByRole('button',{name:'Open linked task: Try one experiment',exact:true}).click();
  await expect(page.getByTestId('screen-entry')).toContainText('SOURCE WHEN TASK WAS CREATED');
  await page.getByRole('button',{name:'Back to previous view',exact:true}).click();
  await navigate(page,'Library');
  await page.getByTestId('screen-library').getByRole('button',{name:`Edit note: ${note}`,exact:true}).click();
  await page.getByRole('textbox',{name:'Edit entry text'}).fill('Changed note only');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByTestId('screen-library')).toContainText('Try one experiment');
  await page.getByTestId('screen-library').getByRole('button',{name:'Remove note: Changed note only',exact:true}).click();
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeVisible();
  await expect(page.getByTestId('screen-library').getByRole('button',{name:'Remove note: Changed note only',exact:true})).toBeHidden();
  page=await session.restart();
  await expect(page.getByRole('button',{name:'Complete Try one experiment',exact:true})).toBeVisible();
  await page.getByTestId('screen-today').getByRole('button',{name:'Open entry: Try one experiment',exact:true}).click();
  await page.getByTestId('screen-entry').getByRole('button',{name:'Open original note: Try one experiment',exact:true}).click();
  await expect(page.getByTestId('screen-entry')).toContainText('Removed');
  await expect(page.getByTestId('screen-entry')).toContainText('Changed note only');
  await page.getByTestId('screen-entry').getByRole('button',{name:'Open linked task: Try one experiment',exact:true}).click();
  await expect(page.getByTestId('screen-entry')).toContainText(note.trim());
});

test('distinct thinking filters and source navigation keep original notes retrievable', async ({session}) => {
  const page=session.page;
  await capture(page,'Note','Original thinking');
  for(const [action,text] of [['Reflect','A changed interpretation'],['Create','An original creation']]) {
    await linkedAction(page,page.getByTestId('today-thinking'),action);
    await page.getByRole('textbox',{name:'Linked entry text'}).fill(text);
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Linked entry text'})).toBeHidden();
  }
  await navigate(page,'Library');
  const library=page.getByTestId('screen-library');
  await expect(page.getByRole('radio',{name:'Reflections',exact:true})).toHaveCount(0);
  await page.getByRole('radio',{name:'Notes',exact:true}).click();
  await page.getByRole('radio',{name:'Reflections',exact:true}).click();
  await expect(library).toContainText('A changed interpretation');
  await expect(library).not.toContainText('An original creation');
  await library.getByRole('button',{name:'Open original note: A changed interpretation',exact:true}).click();
  await expect(page.getByTestId('screen-entry')).toContainText('Original thinking');
  await page.getByRole('button',{name:'Back to previous view',exact:true}).click();
  await page.getByRole('radio',{name:'Creations',exact:true}).click();
  await expect(library).toContainText('An original creation');
  await expect(library).not.toContainText('A changed interpretation');
  await page.getByRole('radio',{name:'Notes',exact:true}).click();
  await expect(library).toContainText('3 of 3 saved entries');
  await page.getByRole('radio',{name:'Tasks',exact:true}).click();
  await expect(page.getByRole('radio',{name:'Reflections',exact:true})).toHaveCount(0);
});

test('scheduled pin form is icon-only, validates time, persists and cancels without notification UI',async({session})=>{
  let page=session.page;
  await capture(page,'Task','Timed task');
  const icon=page.getByRole('button',{name:'Schedule pin: Timed task',exact:true});
  expect(await icon.textContent()).toBe('');
  await icon.click();
  await page.getByRole('textbox',{name:'Pin date'}).fill('2035-02-30');
  await page.getByRole('textbox',{name:'Pin time'}).fill('12:00');
  await page.getByRole('button',{name:'Save scheduled pin',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('valid local');
  await page.getByRole('textbox',{name:'Pin date'}).fill('2035-02-28');
  await page.getByRole('button',{name:'Save scheduled pin',exact:true}).click();
  await expect(page.getByRole('dialog').last()).toBeHidden();
  await expect(page.getByTestId('screen-today')).toContainText('Pins ');
  await expect(page.getByRole('button',{name:'Change scheduled pin: Timed task',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Retry reminder',exact:true})).toHaveCount(0);
  page=await session.restart();
  await page.getByRole('button',{name:'Change scheduled pin: Timed task',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Pin date'})).toHaveValue('2035-02-28');
  await page.getByRole('button',{name:'Remove scheduled pin',exact:true}).click();
  await expect(page.getByRole('dialog').last()).toBeHidden();
  await expect(page.getByRole('button',{name:'Schedule pin: Timed task',exact:true})).toBeVisible();
});

test.describe('realistic library and narrow layout',()=>{
  test.use({observeSQLite:true});
  test('long words, enlarged text and 250 saved entries remain reachable at phone widths',async({session})=>{
    let page=session.page;
    await databaseSQL(page,`BEGIN; ${Array.from({length:250},(_,i)=>`INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) VALUES ('bulk-${i}','bulk-${i}','note','Library note ${i} about a deliberate idea','2026-10-15T00:00:00Z');`).join(' ')} COMMIT;`);
    page=await session.restart();
    const text='A long thought '+('word '.repeat(250))+'🌿';
    await capture(page,'Note',text);
    await navigate(page,'Library');
    const library=page.getByTestId('screen-library');
    await expect(library).toContainText('251 of 251 saved entries');
    await page.getByRole('textbox',{name:'Search saved entries'}).fill('Library note 249');
    await expect(library).toContainText('1 of 251 saved entries');
    for(const width of [360,430]){
      await page.setViewportSize({width,height:800});
      await expect(library.getByRole('button',{name:/^Linked actions:/})).toBeVisible();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      expect(overflow).toBe(false);
    }
    await page.getByRole('textbox',{name:'Search saved entries'}).fill('A long thought');
    await linkedAction(page,library,'New task');
    await expect(page.getByRole('textbox',{name:'New task text'})).toHaveValue(text);
    await page.getByRole('textbox',{name:'New task text'}).fill('Short action');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await navigate(page,'Today');
    await expect(page.getByRole('button',{name:'Complete Short action',exact:true})).toBeVisible();
    // Approximate larger text for a browser layout check; not native font scaling.
    await page.getByTestId('screen-today').evaluate(root=>{
      for(const e of root.querySelectorAll<HTMLElement>('div')) {
        if(e.childElementCount===0 && e.textContent?.trim()) {
          const style=getComputedStyle(e);e.style.fontSize=`${parseFloat(style.fontSize)*1.4}px`;
          e.style.lineHeight=`${parseFloat(style.lineHeight)*1.4 || 30}px`;
        }
      }
    });
    await expect(page.getByRole('button',{name:'Complete Short action',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:'artifacts/ui-v050/enlarged-text.png'});
  });
});

test('note cards show compact linked counts; detail screen groups links and restores list state',async({session})=>{
  const page=session.page;
  await capture(page,'Note','Source note for all links');
  for(const [action,words] of [['Reflect','Reflection child'],['Create','Creation child']]){
    await linkedAction(page,page.getByTestId('today-thinking'),action);
    await page.getByRole('textbox',{name:'Linked entry text'}).fill(words);
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Linked entry text'})).toBeHidden();
  }
  const plus=page.getByTestId('today-thinking').getByRole('button',{name:/^Linked actions:/});
  expect(await plus.textContent()).toBe('');const box=await plus.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
  await linkedAction(page,page.getByTestId('today-thinking'),'New task');await page.getByRole('textbox',{name:'New task text'}).fill('Task child');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'New task text'})).toBeHidden();
  await navigate(page,'Library');
  await page.getByRole('textbox',{name:'Search saved entries'}).fill('Source note for all links');
  const card=page.getByTestId('screen-library').getByTestId(/^entry-/).filter({has:page.getByTestId(/^original-/).filter({hasText:'Source note for all links'})});
  await expect(card).toContainText('1 Task · 1 Reflection · 1 Creation');
  await expect(card).not.toContainText('Task child');await expect(card).not.toContainText('Reflection child');await expect(card).not.toContainText('Creation child');
  await card.getByRole('button',{name:'Open entry: Source note for all links',exact:true}).click();
  const detail=page.getByTestId('screen-entry');await expect(detail).toBeVisible();
  for(const label of ['Open linked task: Task child','Open linked reflection: Reflection child','Open linked creation: Creation child']) await expect(detail.getByRole('button',{name:label,exact:true})).toBeVisible();
  await detail.getByRole('button',{name:'Open linked reflection: Reflection child',exact:true}).click();
  await expect(detail.getByTestId('entry-detail-content')).toContainText('Reflection child');
  await expect(detail.getByTestId('entry-detail-content').getByRole('button',{name:/^Linked actions:/})).toHaveText('');
  await detail.getByRole('button',{name:'Open original note: Reflection child',exact:true}).click();
  await expect(detail.getByTestId('entry-detail-content')).toContainText('Source note for all links');
  await detail.getByRole('button',{name:'Back to previous view',exact:true}).click();
  await expect(detail.getByTestId('entry-detail-content')).toContainText('Reflection child');
  await detail.getByRole('button',{name:'Back to previous view',exact:true}).click();
  await detail.getByRole('button',{name:'Back to previous view',exact:true}).click();
  await expect(page.getByTestId('screen-library')).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Search saved entries'})).toHaveValue('Source note for all links');
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:'artifacts/ui-v070/note-card.png'});
  await card.getByRole('button',{name:'Open entry: Source note for all links',exact:true}).click();
  await page.screenshot({path:'artifacts/ui-v070/entry-detail.png'});
});

test.describe('scheduled pin timing',()=>{
  test.use({observeSQLite:true});
  test('due pins apply while open and overdue pins apply after restart, without reordering existing pins',async({session})=>{
    let page=session.page;
    await capture(page,'Task','Scheduled task');
    // Inject an upcoming persisted intent, then restart to arm the actual app timer.
    await databaseSQL(page,"INSERT INTO scheduled_pins(task_id,due_at,status) SELECT id,strftime('%Y-%m-%dT%H:%M:%fZ','now','+6 seconds'),'waiting' FROM tasks WHERE title='Scheduled task'");
    page=await session.restart();
    await expect(page.getByRole('button',{name:'Unpin Scheduled task',exact:true})).toBeVisible({timeout:20000});
    await capture(page,'Task','Overdue task');
    await databaseSQL(page,"INSERT INTO scheduled_pins(task_id,due_at,status) SELECT id,'2020-01-01T00:00:00.000Z','waiting' FROM tasks WHERE title='Overdue task'");
    page=await session.restart();
    await expect(page.getByRole('button',{name:'Unpin Overdue task',exact:true})).toBeVisible();
    const order=await page.getByRole('button',{name:/^Complete /}).allTextContents();
    await expect.poll(async()=>page.getByRole('button',{name:/^Complete /}).evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-label')))).toEqual(['Complete Scheduled task','Complete Overdue task']);
    await page.getByRole('button',{name:'Complete Scheduled task',exact:true}).click();await navigate(page,'Review');
    const reopen=page.getByRole('button',{name:'Reopen Scheduled task',exact:true});
    expect(await reopen.textContent()).toBe('');const bounds=await reopen.boundingBox();expect(bounds!.width).toBeGreaterThanOrEqual(44);
    await reopen.click();await expect(page.getByTestId('task-review')).not.toContainText('Scheduled task');await expect(page.getByTestId('undo-message')).toBeHidden();
  });
});

test('task menus link independent tasks; Library and entry checkboxes synchronize without navigation',async({session})=>{
  let page=session.page;
  await capture(page,'Task','Parent action');
  const today=page.getByTestId('screen-today');
  await expect(today.getByRole('button',{name:'Linked actions: Parent action',exact:true})).toHaveCount(0);
  const clock=today.getByRole('button',{name:'Schedule pin: Parent action',exact:true});
  const pin=today.getByRole('button',{name:'Pin Parent action',exact:true});
  const [c,i]=await Promise.all([clock.boundingBox(),pin.boundingBox()]);
  expect(c!.x+c!.width).toBeLessThanOrEqual(i!.x+1);
  await navigate(page,'Library');
  await linkedAction(page,page.getByTestId('screen-library'),'New task');
  await expect(page.getByRole('textbox',{name:'New task text'})).toHaveValue('Parent action');
  await page.getByRole('textbox',{name:'New task text'}).fill('Child action');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'New task text'})).toBeHidden();
  await navigate(page,'Today');
  await today.getByRole('button',{name:'Schedule pin: Child action',exact:true}).click();
  await page.getByRole('textbox',{name:'Pin date'}).fill('2035-03-01');await page.getByRole('textbox',{name:'Pin time'}).fill('12:00');
  await page.getByRole('button',{name:'Save scheduled pin',exact:true}).click();
  await today.getByRole('button',{name:'Pin Child action',exact:true}).click();
  await navigate(page,'Library');
  const library=page.getByTestId('screen-library');
  await library.getByRole('checkbox',{name:'Complete Parent action',exact:true}).click();
  await expect(library).toBeVisible();await expect(page.getByTestId('screen-entry')).toHaveCount(0);
  await expect(library.getByRole('button',{name:'Linked actions: Parent action',exact:true})).toHaveCount(0);
  await expect(library.getByRole('button',{name:'Linked actions: Child action',exact:true})).toBeVisible();
  await expect(library.getByRole('button',{name:/^From (note|task):/})).toHaveCount(0);
  await expect(library.getByRole('checkbox',{name:'Reopen Parent action',exact:true})).toBeChecked();
  await expect(library.getByRole('checkbox',{name:'Complete Child action',exact:true})).not.toBeChecked();
  await library.getByRole('button',{name:'Open entry: Parent action',exact:true}).click();
  const detail=page.getByTestId('screen-entry');
  await expect(detail.getByTestId('entry-detail-content').getByRole('button',{name:/^Linked actions:/})).toHaveCount(0);
  await detail.getByRole('checkbox',{name:'Complete linked task: Child action',exact:true}).click();
  await expect(detail.getByRole('checkbox',{name:'Reopen linked task: Child action',exact:true})).toBeChecked();
  await expect(detail.getByTestId('entry-detail-content')).toContainText('Parent action');
  await expect(detail.getByRole('button',{name:'Linked actions: Child action',exact:true})).toHaveCount(0);
  await detail.getByRole('checkbox',{name:'Reopen linked task: Child action',exact:true}).click();
  await expect(detail.getByRole('button',{name:'Linked actions: Child action',exact:true})).toBeVisible();
  await expect(detail.getByRole('button',{name:'Pin Child action',exact:true})).toBeVisible();
  await expect(detail.getByRole('button',{name:'Schedule pin: Child action',exact:true})).toBeVisible();
  await expect(page.getByTestId('undo-message')).toBeHidden();
  await detail.getByRole('button',{name:'Open linked task: Child action',exact:true}).click();
  await expect(detail.getByTestId('entry-detail-content')).toContainText('SOURCE WHEN TASK WAS CREATED');
  await detail.getByRole('checkbox',{name:'Complete Child action',exact:true}).click();
  await expect(detail.getByRole('checkbox',{name:'Reopen Child action',exact:true})).toBeChecked();
  await expect(detail.getByRole('button',{name:/^Linked actions:/})).toHaveCount(0);
  await expect(detail.getByRole('button',{name:/^From (note|task):/})).toHaveCount(0);
  await detail.getByRole('button',{name:'Open original task: Child action',exact:true}).click();
  await expect(detail.getByTestId('entry-detail-content')).toContainText('Parent action');
  await page.screenshot({path:'artifacts/ui-v071/task-entry.png'});
  await navigate(page,'Review');
  await expect(page.getByTestId('task-review').getByRole('button',{name:/^Linked actions:/})).toHaveCount(0);
  await page.screenshot({path:'artifacts/ui-v071/review.png'});
  await expect(page.getByTestId('task-review')).toContainText('Parent action');await expect(page.getByTestId('task-review')).toContainText('Child action');
  page=await session.restart();await navigate(page,'Library');
  await expect(page.getByTestId('screen-library').getByRole('checkbox',{name:'Reopen Child action',exact:true})).toBeChecked();
  await page.getByTestId('screen-library').getByRole('checkbox',{name:'Reopen Child action',exact:true}).click();
  await navigate(page,'Today');await expect(page.getByRole('button',{name:'Complete Child action',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Complete Parent action',exact:true})).toBeHidden();
});

test('note body opens details, long press stays put and bottom pin selects without navigation',async({session})=>{
  const page=session.page;
  await capture(page,'Note','First note');await capture(page,'Note','Second note');
  await navigate(page,'Library');
  const library=page.getByTestId('screen-library');
  const card=library.getByTestId(/^entry-/).filter({has:page.getByRole('button',{name:'Open entry: First note',exact:true})});
  const body=card.getByRole('button',{name:'Open entry: First note',exact:true});
  const plus=card.getByRole('button',{name:'Linked actions: First note',exact:true});
  const pin=card.getByRole('button',{name:'Choose as Today note: First note',exact:true});
  const [b,p,i]=await Promise.all([body.boundingBox(),plus.boundingBox(),pin.boundingBox()]);
  expect(p!.y).toBeLessThan(b!.y);expect(i!.y).toBeGreaterThan(b!.y);expect(Math.abs(p!.x-i!.x)).toBeLessThan(1);
  await page.mouse.move(b!.x+20,b!.y+15);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  await expect(library).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
  await pin.click();await expect(pin).toHaveAttribute('aria-pressed','true');await expect(library).toBeVisible();
  await pin.click();await expect(pin).toHaveAttribute('aria-pressed','true');
  await body.click();await expect(page.getByTestId('entry-detail-content')).toContainText('First note');
  await page.getByRole('button',{name:'Back to previous view',exact:true}).click();
  await navigate(page,'Today');await expect(page.getByTestId('chosen-note-text')).toHaveText('First note');
  await page.screenshot({path:'artifacts/ui-v070/today.png'});
});
