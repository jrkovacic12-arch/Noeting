import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type BrowserSession = {
  page: Page;
  restart: () => Promise<Page>;
};

type SQLiteTestWindow = Window & {
  __noetingDraftWrites?: number;
  __noetingSQLite?: { worker: Worker; nativeDatabaseId: number };
  __noetingAppearance?: { worker: Worker; nativeDatabaseId: number };
};

const test = base.extend<{ session: BrowserSession; observeSQLite: boolean }>({
  observeSQLite: [false, { option: true }],
  session: async ({ baseURL, observeSQLite }, use, testInfo) => {
    const profile = await mkdtemp(join(tmpdir(), "noeting-ui-"));
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
        executablePath: process.env.CHROMIUM_PATH ?? (!process.env.CI && existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        headless: true,
        args: ["--no-sandbox"],
        baseURL,
        viewport: { width: 430, height: 900 },
        hasTouch: true,
      });
      await context.addInitScript((observeDatabase) => {
        // Observe the real worker, preserving all application messages/results.
        // A test can add an actual SQLite constraint without a product test API.
        const original = Worker.prototype.postMessage;
        const seen = new WeakSet<Worker>();
        const writes = new Set<number>();
        (window as SQLiteTestWindow).__noetingDraftWrites = 0;
        Worker.prototype.postMessage = function (
          message: unknown,
          options?: StructuredSerializeOptions | Transferable[],
        ) {
          if (!seen.has(this)) {
            seen.add(this);
            this.addEventListener("message", (event: MessageEvent) => {
              if (event.data.error)
                console.error("NOETING_SQLITE_ERROR", String(event.data.error));
            });
          }
          const packet = message as {
            type?: string;
            data?: { databasePath?: string; nativeDatabaseId: number };
          };
          if (
            observeDatabase &&
            packet.type === "open" &&
            packet.data?.databasePath?.endsWith("noeting.db")
          ) {
            (window as SQLiteTestWindow).__noetingSQLite = {
              worker: this,
              nativeDatabaseId: packet.data.nativeDatabaseId,
            };
          }
          if (
            observeDatabase &&
            packet.type === "open" &&
            packet.data?.databasePath?.endsWith("ExpoSQLiteStorage")
          ) {
            (window as SQLiteTestWindow).__noetingAppearance = {
              worker: this,
              nativeDatabaseId: packet.data.nativeDatabaseId,
            };
          }
          const observed = message as any;
          if (observed.type === "prepare" && observed.data.source.startsWith("INSERT INTO storage"))
            writes.add(observed.data.nativeStatementId);
          if (observed.type === "run" && writes.has(observed.data.nativeStatementId) &&
            Object.values(observed.data.bindParams).includes("noeting.editor-drafts.v2"))
            (window as SQLiteTestWindow).__noetingDraftWrites!++;
          const forward = original.bind(this);
          if (Array.isArray(options)) forward(message, options);
          else forward(message, options);
        };
      }, observeSQLite);
      const page = context.pages()[0] ?? (await context.newPage());
      page.on("console", (message) => {
        if (message.text().startsWith("NOETING_SQLITE_ERROR"))
          console.warn(message.text());
      });
      await page.goto("/");
      await expect(
        page.getByRole("textbox", { name: /^Search (notes|tasks)$/ }),
      ).toBeVisible({ timeout: 45_000 });
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
      if (testInfo.status !== testInfo.expectedStatus) {
        const page = context?.pages()[0];
        if (page && !page.isClosed()) await page.screenshot({ path: testInfo.outputPath("failure.png"), fullPage: true }).catch(() => {});
      }
      await shutdown();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

async function databaseSQL(page: Page, sql: string, appearance = false) {
  await page.evaluate(
    async ({ source, appearance }) => {
      const database = appearance
        ? (window as SQLiteTestWindow).__noetingAppearance
        : (window as SQLiteTestWindow).__noetingSQLite;
      if (!database)
        throw new Error("The real Expo SQLite worker was not observed.");
      const id = -Math.floor(Math.random() * 1_000_000) - 1;
      await new Promise<void>((resolve, reject) => {
        const listener = (event: MessageEvent) => {
          if (event.data.id !== id) return;
          database.worker.removeEventListener("message", listener);
          if (event.data.error) reject(new Error(String(event.data.error)));
          else resolve();
        };
        database.worker.addEventListener("message", listener);
        database.worker.postMessage({
          type: "exec",
          id,
          isSync: false,
          data: { nativeDatabaseId: database.nativeDatabaseId, source },
        });
      });
    },
    { source: sql, appearance },
  );
}

async function tab(page: Page, kind: "note" | "task") {
  await page
    .getByRole("tab", {
      name: kind === "note" ? "Notes" : "Tasks",
      exact: true,
    })
    .click();
}
async function saveText(page: Page, name: "Note" | "Task", text: string) {
  await page
    .getByRole("textbox", { name: `${name} text`, exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: `${name} text`, exact: true }),
  ).toHaveCount(0);
}
async function close(page: Page, kind: "note" | "task") {
  await page
    .getByRole("button", {
      name: kind === "note" ? "Back" : "Close task",
      exact: true,
    })
    .click();
}
async function capture(page: Page, kind: "note" | "task", text: string) {
  await tab(page, kind);
  await page.getByRole("button", { name: `Add ${kind}`, exact: true }).click();
  await saveText(page, kind === "note" ? "Note" : "Task", text);
  await close(page, kind);
  await expect(
    page.getByRole("button", { name: `Open ${kind}: ${text}`, exact: true }),
  ).toBeVisible();
}
async function open(page: Page, kind: "note" | "task", text: string) {
  await page
    .getByRole("button", { name: `Open ${kind}: ${text}`, exact: true })
    .click();
}
async function addSubtask(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Next step", exact: true });
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: `Task text: ${text}`, exact: true }),
  ).toBeVisible();
}
async function connections(page: Page) {
  await page
    .getByRole("button", { name: "More note actions", exact: true })
    .click();
  await page.getByRole("button", { name: /^Connections/ }).click();
}
async function link(page: Page, kind: "note" | "task", text: string) {
  await page
    .getByRole("button", { name: "Add linked entry", exact: true })
    .click();
  await page
    .getByRole("button", { name: `New linked ${kind}`, exact: true })
    .click();
  await saveText(page, kind === "note" ? "Note" : "Task", text);
}
async function removeTask(page: Page, child?: string) {
  await page
    .getByRole("button", {
      name: child ? `Options for ${child}` : "More task actions",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: child ? "Remove subtask" : "Remove task",
      exact: true,
    })
    .click();
}
async function hold(locator: Locator) {
  await expect(locator).toBeEnabled();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw Error("missing card");
  const page = locator.page();
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(360);
  await page.mouse.up();
}
async function newFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill(name);
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await page.getByRole("button", { name: `Folder: ${name}`, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Search notes" })).toBeVisible();
}

test("writing-first Note supports direct edit, copy, original, overlay without layout shift and Remove/Undo", async ({
  session,
}) => {
  const { page } = session;
  await capture(page, "note", "Original words");
  await open(page, "note", "Original words");
  await expect(page.getByRole("button", { name: "Edit note" })).toHaveCount(0);
  const body = page.getByRole("textbox", { name: "Note body" });
  expect(await body.evaluate((e) => e === document.activeElement)).toBe(false);
  await body.fill("Edited words");
  await body.blur();
  await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
  const before = await body.boundingBox();
  await page.getByRole("button", { name: "More note actions" }).click();
  await expect(page.getByTestId("popover-scrim")).toBeVisible();
  await expect(body).toHaveCount(0);
  const raw = page.locator("textarea");
  expect(await raw.boundingBox()).toEqual(before);
  await page.getByRole("button", { name: "View original capture" }).click();
  await expect(page.getByText("Original words", { exact: true })).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Edited words",
  );
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: "Remove note", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open note: Edited words" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("button", { name: "Open note: Edited words" }),
  ).toBeVisible();
});

test("Note links remain contextual; Task source navigation is read-only and frozen", async ({
  session,
}) => {
  const { page } = session;
  await capture(page, "note", "Source Note");
  await open(page, "note", "Source Note");
  await link(page, "note", "Independent Note");
  await close(page, "note");
  await link(page, "task", "Linked root Task");
  await close(page, "task");
  const body = page.getByRole("textbox", { name: "Note body" });
  await body.fill("Later source");
  await body.blur();
  await expect(page.getByText("Saving…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Linked entries", { exact: true })).toHaveCount(
    0,
  );
  await connections(page);
  await page
    .getByRole("button", { name: "Open linked task: Linked root Task" })
    .click();
  await expect(page.getByText("Source Note", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add linked entry" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View source Note" }).click();
  await expect(page.getByText("Later source", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note body" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add linked entry" }),
  ).toHaveCount(0);
  await close(page, "note");
  await addSubtask(page, "Child of linked task");
  await close(page, "task");
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: "Remove note" }).click();
  await tab(page, "task");
  await open(page, "task", "Linked root Task");
  await expect(page.getByText("Source Note", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View source Note" }).click();
  await expect(page.getByText("Later source", { exact: true })).toBeVisible();
});

test("inline Task and children synchronize completion, group/collapse, edit and survive offline restart", async ({
  session,
}) => {
  let { page } = session;
  await capture(page, "task", "Build prototype");
  await open(page, "task", "Build prototype");
  const title = page.getByRole("textbox", {
    name: "Task text: Build prototype",
    exact: true,
  });
  expect(await title.evaluate((e) => e === document.activeElement)).toBe(false);
  await title.press("Enter");
  await expect(page.getByRole("textbox", { name: "Next step" })).toBeFocused();
  await addSubtask(page, "Paper sketch");
  await addSubtask(page, "Write code");
  await page
    .getByRole("checkbox", { name: "Complete subtask: Paper sketch" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Complete task", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("textbox", { name: "Task text: Write code" })
    .fill("Implement offline");
  await page.getByRole("textbox", { name: "Task text: Write code" }).blur();
  await expect(
    page.getByRole("textbox", { name: "Task text: Implement offline" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Complete subtask: Implement offline" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Reopen task", exact: true }),
  ).toBeChecked();
  await close(page, "task");
  await page.getByRole("button", { name: "Completed (1)" }).click();
  await expect(
    page.getByRole("button", { name: "Open subtask: Implement offline" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse Build prototype: 2/2" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open subtask: Implement offline" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Expand Build prototype: 2/2" })
    .click();
  page = await session.restart();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Completed (1)" }).click();
  await open(page, "task", "Build prototype");
  await expect(
    page.getByRole("checkbox", { name: "Reopen subtask: Paper sketch" }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Reopen task", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Complete subtask: Implement offline" }),
  ).not.toBeChecked();
});

test("child-only search shows parent and matching child and reveals the row in a long sheet", async ({
  session,
}) => {
  const { page } = session;
  await capture(page, "task", "Parent project");
  await open(page, "task", "Parent project");
  for (let i = 0; i < 10; i++)
    await addSubtask(page, i === 9 ? "Unique needle" : "Step " + i);
  await close(page, "task");
  await page.getByRole("textbox", { name: "Search tasks" }).fill("Unique");
  await expect(
    page.getByRole("button", { name: "Open task: Parent project" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open subtask: Step 0" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open subtask: Unique needle" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Task text: Unique needle" }),
  ).toBeInViewport();
  await expect(page.getByText("Subtasks", { exact: true })).toHaveCount(0);
});

test("parent and child removal preserve orphan access and Undo regroups", async ({
  session,
}) => {
  const { page } = session;
  await capture(page, "task", "Keep hierarchy");
  await open(page, "task", "Keep hierarchy");
  await addSubtask(page, "Surviving child");
  await removeTask(page, "Surviving child");
  await expect(
    page.getByRole("textbox", { name: "Task text: Surviving child" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("textbox", { name: "Task text: Surviving child" }),
  ).toBeVisible();
  await removeTask(page);
  await expect(page.getByText("Parent removed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open task: Surviving child" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search tasks" }).fill("Surviving");
  await open(page, "task", "Surviving child");
  await close(page, "task");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Clear search" }).click();
  await open(page, "task", "Keep hierarchy");
  await expect(
    page.getByRole("textbox", { name: "Task text: Surviving child" }),
  ).toBeVisible();
});

test("outside tap, swipe and Escape restore matching creation drafts automatically without Resume", async ({
  session,
}) => {
  let { page } = session;
  await tab(page, "task");
  await page.getByRole("button", { name: "Add task" }).click();
  await page
    .getByRole("textbox", { name: "Task text", exact: true })
    .fill("Retained draft");
  await page.getByRole("button", { name: "Dismiss task sheet" }).click();
  page = await session.restart();
  await expect(page.getByRole("button", { name: "Resume draft" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(
    page.getByRole("textbox", { name: "Task text", exact: true }),
  ).toHaveValue("Retained draft");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("task-sheet")).toHaveCount(0);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("task-sheet")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  const bounds = await page
    .getByRole("button", { name: "Expand task sheet" })
    .boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 110, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByTestId("task-sheet")).toHaveCount(0);
  await tab(page, "note");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  await tab(page, "task");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Task text: Retained draft" }),
  ).toBeVisible();
});

test.describe("preservation and failure recovery against real SQLite", () => {
  test.use({ observeSQLite: true });
  for (const version of [6, 7, 8])
    test(`populated v${version} upgrade retains legacy words and source navigation`, async ({
      session,
    }) => {
      let { page } = session;
      const fixture = await readFile(
        join(process.cwd(), `tests/fixtures/schema-v${version}-populated.sql`),
        "utf8",
      );
      await databaseSQL(
        page,
        `PRAGMA foreign_keys=OFF; DROP TABLE note_organization; DROP TABLE note_folders; DROP TABLE entry_sources; DROP TABLE thinking_links; DROP TABLE task_sources; DROP TABLE today_selection; DROP TABLE scheduled_pins; DROP TABLE reminders; DROP TABLE tasks; DROP TABLE entries; ${fixture}`,
      );
      page = await session.restart();
      if (version === 8) {
        await expect(
          page.getByRole("button", { name: "Open note: Edited 🌿" }),
        ).toBeVisible();
        await tab(page, "task");
        await open(page, "task", "Parent");
        await expect(
          page.getByRole("textbox", { name: "Task text: Child A" }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("button", {
            name: "Open note: A reflection kept as a note",
          }),
        ).toBeVisible();
        await tab(page, "task");
        await expect(
          page.getByRole("button", { name: "Open task: Task from task" }),
        ).toBeVisible();
        if (version === 7) {
          await page.getByRole("button", { name: /^Completed/ }).click();
          await open(page, "task", "V7 note-linked task");
          await expect(
            page.getByRole("button", { name: "View source Note" }),
          ).toBeVisible();
          await close(page, "task");
          await open(page, "task", "V7 legacy task-sourced task");
          await expect(
            page.getByRole("button", { name: "View legacy source" }),
          ).toBeVisible();
        }
      }
    });
  test("failed linked Task and Enter child saves retain exact words and retry once", async ({
    session,
  }) => {
    let { page } = session;
    await capture(page, "note", "Parent note");
    await open(page, "note", "Parent note");
    await databaseSQL(
      page,
      "CREATE TRIGGER fail_link BEFORE INSERT ON entry_sources BEGIN SELECT RAISE(ABORT,'Injected link failure'); END;",
    );
    await page.getByRole("button", { name: "Add linked entry" }).click();
    await page.getByRole("button", { name: "New linked task" }).click();
    await page
      .getByRole("textbox", { name: "Task text", exact: true })
      .fill("Keep these words");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Your words are still here",
    );
    await databaseSQL(page, "DROP TRIGGER fail_link");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await databaseSQL(
      page,
      "CREATE TRIGGER fail_sub BEFORE INSERT ON tasks WHEN NEW.parent_task_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'Injected subtask failure'); END;",
    );
    const next = page.getByRole("textbox", { name: "Next step" });
    await next.fill("Retry child");
    await next.press("Enter");
    await expect(next).toHaveValue("Retry child");
    await expect(
      page.getByRole("button", { name: "Retry next step" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close task" }).click();
    await expect(page.getByRole("textbox", { name: "Next step" })).toHaveValue(
      "Retry child",
    );
    await expect(
      page.getByRole("button", { name: "Retry next step" }),
    ).toBeVisible();
    page = await session.restart();
    await tab(page, "task");
    await open(page, "task", "Keep these words");
    await expect(page.getByRole("textbox", { name: "Next step" })).toHaveValue(
      "Retry child",
    );
    await databaseSQL(page, "DROP TRIGGER fail_sub");
    await page.getByRole("textbox", { name: "Next step" }).press("Enter");
    await expect(
      page.getByRole("textbox", { name: "Task text: Retry child" }),
    ).toHaveCount(1);
  });
  test("autosave failure and scoped edit drafts survive restart without leaking across Notes", async ({
    session,
  }) => {
    let { page } = session;
    await capture(page, "note", "One");
    await capture(page, "note", "Two");
    await open(page, "note", "One");
    await databaseSQL(
      page,
      "CREATE TRIGGER fail_edit BEFORE UPDATE OF edited_text ON entries BEGIN SELECT RAISE(ABORT,'edit failed'); END;",
    );
    await page
      .getByRole("textbox", { name: "Note body" })
      .fill("One unsaved 🌿\n  words");
    await page.getByRole("textbox", { name: "Note body" }).blur();
    await expect(
      page.getByRole("button", { name: "Retry save" }),
    ).toBeVisible();
    await close(page, "note");
    await open(page, "note", "Two");
    await expect(page.getByRole("textbox", { name: "Note body" })).toHaveValue(
      "Two",
    );
    await close(page, "note");
    page = await session.restart();
    await open(page, "note", "One");
    await expect(page.getByRole("textbox", { name: "Note body" })).toHaveValue(
      "One unsaved 🌿\n  words",
    );
    await expect(
      page.getByRole("button", { name: "Retry save" }),
    ).toBeVisible();
    await databaseSQL(page, "DROP TRIGGER fail_edit");
    await page.getByRole("button", { name: "Retry save" }).click();
    await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
    await close(page, "note");
    await expect(
      page.getByRole("button", { name: "Open note: One unsaved 🌿\n  words" }),
    ).toBeVisible();
  });
  test("draft storage failure blocks dismissal; legacy draft migrates into its own context", async ({
    session,
  }) => {
    let { page } = session;
    await databaseSQL(
      page,
      `INSERT OR REPLACE INTO storage(key,value) VALUES ('noeting.editor-draft.v1','{"kind":"note","text":"Legacy draft","requestId":"legacy"}');`,
      true,
    );
    page = await session.restart();
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
      "Legacy draft",
    );
    await databaseSQL(
      page,
      "CREATE TRIGGER fail_draft BEFORE UPDATE ON storage BEGIN SELECT RAISE(ABORT,'storage failed'); END;",
      true,
    );
    await page
      .getByRole("textbox", { name: "Note text" })
      .fill("Retained storage failure");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
      "Retained storage failure",
    );
    await databaseSQL(page, "DROP TRIGGER fail_draft", true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
      "Retained storage failure",
    );
  });
});

test("folders, long-press multi-select, mixed Pin/Unpin, move, search restart and recovery", async ({
  session,
}) => {
  let { page } = session;
  await capture(page, "note", "Alpha");
  await capture(page, "note", "Beta");
  await capture(page, "note", "Gamma");
  await hold(page.getByRole("button", { name: "Open note: Alpha" }));
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note body" })).toHaveCount(0);
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(page.getByText("1 selected")).toHaveCount(0);
  await newFolder(page, "Ideas");
  await page.getByRole("button", { name: "Folder: All", exact: true }).click();
  await hold(page.getByRole("button", { name: "Open note: Alpha" }));
  await page.getByRole("button", { name: "Open note: Beta" }).click();
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await hold(page.getByRole("button", { name: "Open note: Alpha" }));
  await page.getByRole("button", { name: "Open note: Beta" }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByRole("button", { name: "Move to Ideas" }).click();
  await page.getByRole("button", { name: "Folder: Ideas" }).click();
  await expect(
    page.getByRole("button", { name: "Open note: Gamma" }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search notes" }).fill("Alpha");
  page = await session.restart();
  await expect(page.getByRole("textbox", { name: "Search notes" })).toHaveValue(
    "Alpha",
  );
  await expect(
    page.getByRole("button", { name: "Folder: Ideas" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Clear search" }).click();
  await hold(page.getByRole("button", { name: "Open note: Alpha" }));
  await page.getByRole("button", { name: "Open note: Beta" }).click();
  await page.getByRole("button", { name: "Unpin", exact: true }).click();
  await hold(page.getByRole("button", { name: "Open note: Alpha" }));
  await page.getByRole("button", { name: "Open note: Beta" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Open note:/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /^Open note:/ })).toHaveCount(
    2,
  );
  await hold(page.getByRole("button", { name: "Open note: Alpha" }));
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "More notes options" }).click();
  await page
    .getByRole("button", { name: "Recently deleted", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore: Alpha" }).click();
  await page.getByRole("button", { name: "Back to notes" }).click();
  await expect(
    page.getByRole("button", { name: "Open note: Alpha" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await hold(page.getByRole("button", { name: "Folder: Ideas", exact: true }));
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("Thoughts");
  await page.getByRole("button", { name: "Save folder" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete folders", exact: true }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open note: Alpha" }),
  ).toBeVisible();
});

test("Notes captured or linked within a folder remain there after restart", async ({
  session,
}) => {
  let { page } = session;
  await newFolder(page, "Project");
  await page.getByRole("button", { name: "Add note" }).click();
  await saveText(page, "Note", "Folder capture");
  await close(page, "note");
  await open(page, "note", "Folder capture");
  await link(page, "note", "Folder link");
  await close(page, "note");
  await close(page, "note");
  await expect(
    page.getByRole("button", { name: "Open note: Folder link" }),
  ).toBeVisible();
  page = await session.restart();
  await expect(
    page.getByRole("button", { name: "Open note: Folder capture" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open note: Folder link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Folder: Uncategorized" }).click();
  await expect(page.getByRole("button", { name: /^Open note:/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Folder: Project" }).click();
  await page.getByRole("button", { name: "Add note" }).click();
  await page
    .getByRole("textbox", { name: "Note text" })
    .fill("Retained folder draft");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveCount(0);
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await hold(page.getByRole("button", { name: "Folder: Project", exact: true }));
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete folders", exact: true }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Folder: Project" }),
  ).toHaveCount(0);
  page = await session.restart();
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
    "Retained folder draft",
  );
  await saveText(page, "Note", "Retained folder draft");
  await close(page, "note");
  await expect(
    page.getByRole("button", { name: "Folder: Uncategorized" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Open note: Retained folder draft" }),
  ).toBeVisible();
});

test.describe("durable cancellation", () => {
  test.use({ observeSQLite: true });
  test("Cancel only closes after its draft is durably discarded", async ({
    session,
  }) => {
    let { page } = session;
    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByRole("textbox", { name: "Note text" }).fill("Must discard");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
      "Must discard",
    );
    await databaseSQL(
      page,
      "CREATE TRIGGER fail_cancel BEFORE UPDATE ON storage BEGIN SELECT RAISE(ABORT,'storage failed'); END;",
      true,
    );
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
      "Must discard",
    );
    await expect(page.getByRole("alert")).toContainText(
      "Could not discard draft",
    );
    await databaseSQL(page, "DROP TRIGGER fail_cancel", true);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveCount(
      0,
    );
    page = await session.restart();
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
      "",
    );
  });
});

test("reverting an inline edit to the committed text clears Unsaved", async ({
  session,
}) => {
  const { page } = session;
  await capture(page, "note", "Original text");
  await open(page, "note", "Original text");
  const body = page.getByRole("textbox", { name: "Note body" });
  await body.fill("Interim text");
  await body.fill("Original text");
  await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
  await close(page, "note");
  await expect(
    page.getByRole("button", { name: "Open note: Original text" }),
  ).toBeVisible();
});

test("immediate scrim, compact sheet, circle FAB, IME/Enter, 320px large text and system themes", async ({
  session,
}) => {
  const { page } = session;
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.getByRole("textbox", { name: "Search notes" })).toHaveCSS(
    "color",
    "rgb(239, 239, 239)",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.getByRole("tab")).toHaveCount(2);
  await tab(page, "task");
  await expect(page.getByRole("button", { name: "Add task" })).toHaveCSS(
    "border-radius",
    "30px",
  );
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(
    page.getByRole("button", { name: "Dismiss task sheet" }).locator(".."),
  ).toHaveCSS("background-color", "rgba(0, 0, 0, 0.33)");
  const before = await page.getByTestId("task-sheet").boundingBox();
  expect(before!.height).toBeLessThan(350);
  await expect(
    page.getByRole("textbox", { name: "Task text", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Task text", exact: true })
    .fill("Enter parent");
  await page
    .getByRole("textbox", { name: "Task text", exact: true })
    .press("Enter");
  const next = page.getByRole("textbox", { name: "Next step" });
  await expect(next).toBeFocused();
  await next.press("Enter");
  // Empty Enter may dismiss the keyboard; it must never create an empty child.
  await expect(page.getByRole("textbox", { name: /^Task text:/ })).toHaveCount(
    1,
  );
  await next.fill("Composed child");
  await next.dispatchEvent("compositionstart");
  await next.press("Enter");
  await expect(next).toHaveValue("Composed child");
  await next.dispatchEvent("compositionend");
  await next.press("Enter");
  await expect(next).toHaveValue("");
  await expect(next).toBeFocused();
  await next.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Task text: Composed child" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Expand task sheet" }).click();
  expect(
    (await page.getByTestId("task-sheet").boundingBox())!.height,
  ).toBeGreaterThan(before!.height);
  await page.addStyleTag({
    content: '[dir="auto"] {font-size: 24px !important;}',
  });
  await expect(next).toBeVisible();
  const bounds = await page
    .getByRole("button", { name: "More task actions" })
    .boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "More task actions" }).click();
  // The sheet is already a dialog; wait for the newly opened menu itself.
  await expect(page.getByTestId("popover-scrim")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("popover-scrim")).toHaveCount(0);
  await expect(page.getByTestId("task-sheet")).toBeVisible();
});

test.describe("bulk integrity, scroll gestures and large lists", () => {
  test.use({ observeSQLite: true });
  test("large offline lists stay grouped; scroll cancels hold, Back clears selection and bulk failure retains it", async ({
    session,
  }) => {
    let { page } = session;
    await databaseSQL(
      page,
      `BEGIN; WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<1000) INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) SELECT 'bulk-'||i,'bulk-'||i,'note','Note '||printf('%04d',i),'2026-01-01T00:00:00.000Z' FROM n; WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<200) INSERT INTO entries(id,capture_request_id,kind,original_text,created_at) SELECT 'task-bulk-'||i,'task-bulk-'||i,'task','Project '||i,'2026-01-01T00:00:00.000Z' FROM n; INSERT INTO tasks(id,entry_id,title,status,pinned,created_at) SELECT 't-'||id,id,original_text,'pending',0,created_at FROM entries WHERE kind='task'; COMMIT;`,
    );
    page = await session.restart();
    const card = page.getByRole("button", {
      name: "Open note: Note 0001",
      exact: true,
    });
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box!.x + 40, y: box!.y + 40 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box!.x + 40, y: box!.y - 120 }],
    });
    await page.waitForTimeout(360);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.getByText("1 selected", { exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Search notes" }).fill("Note 000");
    const first = page.getByRole("button", {
      name: "Open note: Note 0001",
      exact: true,
    });
    async function touchHold(target: Locator) {
      await target.scrollIntoViewIfNeeded();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const b = await target.boundingBox();
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: b!.x + b!.width / 2, y: b!.y + 20 }],
      });
      await expect(page.getByText("1 selected", { exact: true })).toBeVisible({
        timeout: 5000,
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(target).toHaveAttribute("aria-pressed", "true");
    }
    await touchHold(first);
    await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 selected", { exact: true })).toHaveCount(0);
    await touchHold(first);
    await page
      .getByRole("button", { name: "Open note: Note 0002", exact: true })
      .tap();
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await databaseSQL(
      page,
      "CREATE TRIGGER fail_bulk BEFORE UPDATE ON note_organization WHEN NEW.entry_id='bulk-2' BEGIN SELECT RAISE(ABORT,'bulk failed'); END;",
    );
    await page.getByRole("button", { name: "Pin", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await expect(page.getByText(/Pinned ·/)).toHaveCount(0);
    await databaseSQL(page, "DROP TRIGGER fail_bulk");
    await page.getByRole("button", { name: "Pin", exact: true }).click();
    await expect(page.getByText("2 selected")).toHaveCount(0);
    await expect(page.getByText(/Pinned ·/)).toHaveCount(2);
    page = await session.restart();
    await page.context().setOffline(true);
    const ordered = page.getByRole("button", { name: /^Open note:/ });
    await expect(ordered.nth(0)).toHaveAttribute(
      "aria-label",
      "Open note: Note 0001",
    );
    await expect(ordered.nth(1)).toHaveAttribute(
      "aria-label",
      "Open note: Note 0002",
    );
    await tab(page, "task");
    await expect(
      page.getByRole("button", { name: "Open task: Project 1", exact: true }),
    ).toBeAttached();
    await page
      .getByRole("textbox", { name: "Search tasks" })
      .fill("Project 199");
    await expect(page.getByRole("button", { name: /^Open task:/ })).toHaveCount(
      1,
    );
    await tab(page, "note");
    await expect(
      page.getByRole("textbox", { name: "Search notes" }),
    ).toHaveValue("Note 000");
  });
});


test("folder screen long-press selection, pin ordering, rename and safe bulk deletion", async ({ session }) => {
  let { page } = session;
  await capture(page, "note", "Keep these words");
  await newFolder(page, "Alpha");
  await newFolder(page, "Beta");
  await capture(page, "note", "Beta note");
  const strip = page.getByTestId("folder-strip");
  await expect(strip.getByRole("button")).toHaveText(["All", "Alpha", "Beta", "Uncategorized"]);
  await page.getByRole("textbox", { name: "Search notes" }).fill("not a match");
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await page.screenshot({ path: "work/folders-screen.png" });
  const beta = page.getByRole("button", { name: "Folder: Beta", exact: true });
  await expect(beta).toContainText("1"); // Counts ignore search.
  await hold(beta);
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(beta).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Folder: Alpha", exact: true }).click();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.screenshot({ path: "work/folders-selection.png" });
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Folder: All", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Folder: Uncategorized", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await hold(beta);
  await expect(page.getByRole("button", { name: "Unpin", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unpin", exact: true }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).click();
  page = await session.restart();
  await expect(page.getByTestId("folder-strip").getByRole("button")).toHaveText(["All", "Alpha", "Beta", "Uncategorized"]);
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await hold(page.getByRole("button", { name: "Folder: Alpha", exact: true }));
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("Zebra");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await page.getByRole("button", { name: "Close folder selection" }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).click();
  await expect(page.getByTestId("folder-strip").getByRole("button")).toHaveText(["All", "Zebra", "Beta", "Uncategorized"]);
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await page.getByRole("button", { name: "Select folders to delete" }).click();
  await page.getByRole("button", { name: "Folder: Zebra", exact: true }).click();
  await page.getByRole("button", { name: "Folder: Beta", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Your notes will move to Uncategorized. No notes will be deleted.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete folders", exact: true }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).click();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("button", { name: "Folder: Uncategorized", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Open note: Keep these words" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open note: Beta note" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await expect(page.getByRole("button", { name: "New folder", exact: true })).toBeVisible();
  await page.screenshot({ path: "work/folders-small.png" });
});


test.describe("optional list preferences", () => {
  test.use({ observeSQLite: true });
  test("one-time preference read failure opens stored notes with safe defaults", async ({ session }) => {
    const { page } = session;
    await capture(page, "note", "Stored before preference failure");
    await tab(page, "task");
    await page.getByRole("textbox", { name: "Search tasks" }).fill("old filter");
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      const reads = new Set<number>();
      Worker.prototype.postMessage = function (message: any, options?: any) {
        if (message.type === "prepare" && message.data.source === "SELECT value FROM storage WHERE key = ?;")
          reads.add(message.data.nativeStatementId);
        if (message.type === "run" && reads.has(message.data.nativeStatementId) &&
          Object.values(message.data.bindParams).includes("noeting.list-context.v1") &&
          !sessionStorage.getItem("preference-read-failed")) {
          sessionStorage.setItem("preference-read-failed", "yes");
          throw new Error("Injected preference read failure");
        }
        return original.call(this, message, options);
      };
    });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Search notes" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Open note: Stored before preference failure" })).toBeVisible();
    await expect(page.getByText("Could not restore list preferences. Using defaults.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Search notes" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Open note: Stored before preference failure" })).toBeVisible();
  });
  test("malformed or invalid preference shapes fall back without blocking capture", async ({ session }) => {
    const { page } = session;
    await capture(page, "note", "Existing words");
    for (const raw of ["{broken", "null", '[]', '{"tab":"task","folder":42,"queries":{"note":false,"task":"stale"}}']) {
      await databaseSQL(page, `UPDATE storage SET value='${raw}' WHERE key='noeting.list-context.v1'`, true);
      await page.reload();
      await expect(page.getByRole("textbox", { name: "Search notes" })).toHaveValue("");
      await expect(page.getByRole("button", { name: "Open note: Existing words" })).toBeVisible();
    }
    await capture(page, "note", "Created after bad preferences");
  });
  test("valid preferences restore and failed writes allow later changes", async ({ session }) => {
    let { page } = session;
    await capture(page, "note", "Still here");
    await databaseSQL(page, "CREATE TRIGGER fail_preferences BEFORE UPDATE ON storage WHEN NEW.key='noeting.list-context.v1' BEGIN SELECT RAISE(ABORT,'preference write failed'); END", true);
    await tab(page, "task");
    await expect(page.getByText("Could not keep list preferences.")).toBeVisible();
    await databaseSQL(page, "DROP TRIGGER fail_preferences", true);
    await page.getByRole("textbox", { name: "Search tasks" }).fill("remember tasks");
    await expect(page.getByText("Could not keep list preferences.")).toHaveCount(0);
    page = await session.restart();
    await expect(page.getByRole("textbox", { name: "Search tasks" })).toHaveValue("remember tasks");
    await tab(page, "note");
    await expect(page.getByRole("textbox", { name: "Search notes" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Open note: Still here" })).toBeVisible();
  });
});


test("draft write measurement: typing, context switch, save and reload", async ({ session }) => {
  let { page } = session;
  const writes = () => page.evaluate(() => (window as SQLiteTestWindow).__noetingDraftWrites ?? 0);
  const initial = await writes();
  await page.getByRole("button", { name: "Add note" }).click();
  const input = page.getByRole("textbox", { name: "Note text", exact: true });
  await input.pressSequentially("Representative typing burst", { delay: 0 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  const typed = (await writes()) - initial;
  await tab(page, "task");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("textbox", { name: "Task text", exact: true }).fill("Separate task draft");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  const switched = (await writes()) - initial;
  expect(typed).toBeLessThan(15);
  expect(switched).toBeLessThan(18);
  page = await session.restart();
  await tab(page, "note");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("textbox", { name: "Note text", exact: true })).toHaveValue("Representative typing burst");
  await saveText(page, "Note", "Representative typing burst");
  await close(page, "note");
  await tab(page, "task");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task text", exact: true })).toHaveValue("Separate task draft");
  console.log("DRAFT_WRITE_MEASUREMENT", JSON.stringify({ typingAndLeave: typed, throughContextSwitch: switched, afterReloadAndSave: await writes() }));
});


test.describe('draft migration recovery', () => {
  test.use({ observeSQLite: true });
  test('failed v1 draft migration retries without deleting the original words', async ({ session }) => {
    const { page } = session;
    await databaseSQL(page, `INSERT INTO storage(key,value) VALUES ('noeting.editor-draft.v1','{"kind":"note","text":"Migration retained words","requestId":"migration-retry"}'); CREATE TRIGGER fail_migration BEFORE UPDATE ON storage WHEN NEW.key='noeting.editor-drafts.v2' BEGIN SELECT RAISE(ABORT,'migration write failed'); END;`,true);
    await page.reload();
    await expect(page.getByText('Could not load drafts. Retry opening the app.')).toBeVisible();
    await databaseSQL(page,'DROP TRIGGER fail_migration',true);
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Search notes'})).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button',{name:'Add note'}).click();
    await expect(page.getByRole('textbox',{name:'Note text',exact:true})).toHaveValue('Migration retained words');
    await saveText(page,'Note','Migration retained words');
    await close(page,'note');
    await page.reload();
    await expect(page.getByRole('button',{name:'Open note: Migration retained words'})).toBeVisible();
  });
});
