import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
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

test('three persistent pins is the limit and completing a task releases its pin', async ({ session }) => {
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
  await expect(page.getByRole('button', { name: 'Pin Fourth focus', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Complete Second focus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pin Fourth focus', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Pin Fourth focus', exact: true }).click();
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
  expect(icon!.x).toBeGreaterThan(title!.x + title!.width);
  await page.getByRole('button',{name:'Complete Finish a real task',exact:true}).click();
  await expect(page.getByText('No pending tasks',{exact:true})).toBeVisible();
  // A direct Note capture now selects it atomically.
  expect(await page.getByTestId('chosen-note-text').textContent()).toBe(original);
  await expect(page.getByTestId('daily-summary')).toContainText('0 open · 1 completed · 2 saved entries');
  const thinking = page.getByTestId('today-thinking');
  await thinking.getByRole('button',{name:'Reflect',exact:true}).click();
  await page.getByRole('textbox',{name:'Linked entry text',exact:true}).fill('  My thinking changed.  ');
  await page.context().setOffline(true);
  await page.getByRole('button',{name:'Save',exact:true}).dblclick();
  await expect(page.getByRole('textbox',{name:'Linked entry text',exact:true})).toBeHidden();
  await thinking.getByRole('button',{name:'Create',exact:true}).click();
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
  await source.getByRole('button',{name:'Today note',exact:true}).click();
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
    await page.getByTestId('today-thinking').getByRole('button',{name:'Reflect',exact:true}).click();
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

test('Today note auto-selection, long-press copy/edit/remove and Undo survive restart', async ({session}) => {
  let page=session.page;
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await capture(page,'Note','  New Today note 🌿  ');
  await expect(page.getByTestId('chosen-note-text')).toHaveText('New Today note 🌿');
  await longPress(page,page.getByRole('button',{name:'Today note tools',exact:true}));
  await expect(page.getByRole('dialog').getByRole('button',{name:/^(Copy|Edit|Remove)$/})).toHaveCount(3);
  await page.getByRole('button',{name:'Copy',exact:true}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('  New Today note 🌿  ');
  await longPress(page,page.getByRole('button',{name:'Today note tools',exact:true}));
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('textbox',{name:'Edit entry text',exact:true}).fill('  Edited Today note\n🌿  ');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByTestId('chosen-note-text')).toHaveText('Edited Today note\n🌿');
  await navigate(page,'Library');
  await page.getByRole('textbox',{name:'Search saved entries'}).fill('Edited Today');
  await expect(page.getByTestId(/^entry-/).filter({visible:true})).toHaveCount(1);
  await navigate(page,'Today');
  await longPress(page,page.getByRole('button',{name:'Today note tools',exact:true}));
  await page.getByRole('button',{name:'Remove',exact:true}).click();
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
  await longPress(page,page.getByRole('button',{name:'Task tools: Original task',exact:true}));
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('textbox',{name:'Edit entry text',exact:true}).fill('Edited task');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Complete Edited task',exact:true})).toBeVisible();
  await navigate(page,'Library');
  const task=page.getByTestId(/^entry-/).filter({visible:true});
  await expect(task.getByTestId(/^original-/)).toHaveText('Edited task');
  await task.getByRole('button',{name:'Reflect',exact:true}).click();
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
  const note=page.getByRole('button',{name:'Today note tools',exact:true});
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
  await page.getByRole('button',{name:'Today note tools',exact:true}).click();
  await page.getByRole('button',{name:'Remove',exact:true}).click();
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
  await page.getByRole('button',{name:'Today note tools',exact:true}).click();
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
