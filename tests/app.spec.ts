import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type BrowserSession = {
  page: Page;
  restart: () => Promise<Page>;
};

type SQLiteTestWindow = Window & { __noetingSQLite?: { worker: Worker; nativeDatabaseId: number } };

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

async function capture(page: Page, kind: 'Note' | 'Task', text: string) {
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('radio', { name: kind, exact: true }).click();
  await page.getByRole('textbox', { name: 'Capture text', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Save & close', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Capture text', exact: true })).toBeHidden();
}

async function databaseSQL(page: Page, sql: string) {
  await page.evaluate(async (source) => {
    const database = (window as SQLiteTestWindow).__noetingSQLite;
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
  }, sql);
}

test('notes, tasks, pins, and completion survive a full browser restart', async ({ session }) => {
  let page = session.page;
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();
  await capture(page, 'Note', 'A durable local note\nwith a second line.');
  await expect(page.getByText(/^1 notes? saved locally/)).toBeVisible();
  await capture(page, 'Task', 'Prepare tomorrow');
  await page.getByRole('button', { name: 'Pin Prepare tomorrow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpin Prepare tomorrow', exact: true })).toBeVisible();

  page = await session.restart();
  await expect(page.getByText(/^1 notes? saved locally/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpin Prepare tomorrow', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete Prepare tomorrow', exact: true }).click();
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();

  page = await session.restart();
  await expect(page.getByText('No pending tasks', { exact: true })).toBeVisible();
  await expect(page.getByText(/^1 notes? saved locally/)).toBeVisible();
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
  await page.getByRole('button', { name: '+ Add task', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Capture text', exact: true });
  const save = page.getByRole('button', { name: 'Save & close', exact: true });
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
    await page.getByRole('button', { name: '+ Add task', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Capture text', exact: true });
    const original = 'Keep this draft\nand its second line.';
    await input.fill(original);
    await page.getByRole('button', { name: 'Save & close', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Could not confirm the save');
    await expect(input).toHaveValue(original);
    await expect(page.getByRole('radio', { name: 'Task', exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Save & close', exact: true })).toBeEnabled();

    await databaseSQL(page, 'DROP TRIGGER noeting_test_write_failure;');
    await page.getByRole('button', { name: 'Save & close', exact: true }).click();
    await expect(input).toBeHidden();
    await expect(page.getByRole('button', { name: /^Complete Keep this draft/ })).toHaveCount(1);
    page = await session.restart();
    await expect(page.getByRole('button', { name: /^Complete Keep this draft/ })).toHaveCount(1);
    await expect(page.getByText(/^0 notes saved locally/)).toBeVisible();
  });
});
