import { test, expect, chromium, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { createPCServer } from "../src/sync/server";
import { replica } from "./syncFixtures";
import { syncNow, type RPC } from "../src/sync/client";
const adminToken = "disposable-pc-admin-secret-".repeat(2);
const token = "disposable-browser-test-secret-".repeat(2);
async function pc() {
  const r = replica();
  const server = createPCServer(r.repo, token, undefined, adminToken);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    r,
    server,
    url,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      r.db.close();
    },
  };
}
async function browser() {
  return chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ??
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
    headless: true,
  });
}
async function login(page: Page, url: string) {
  await page.goto(url);
  await page.locator("#secret").fill(adminToken);
  await page.getByRole("button", { name: "Open local library" }).click();
  await expect(page.locator("#library")).toBeVisible();
}
test("PC browser commits notes, folders, tasks, restore, original text and rejects a stale open editor", async () => {
  const h = await pc(),
    phone = replica(),
    b = await browser();
  try {
    const rpc: RPC = async (action, input) => {
      const r = await fetch(`${h.url}/api/sync/v2/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ protocol: 2, ...input }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      return data;
    };
    await phone.repo.saveCapture({
      requestId: "seed",
      kind: "note",
      text: "Android original",
    });
    await syncNow(phone.repo, rpc, true);
    const page = await b.newPage();
    await login(page, h.url);
    await page
      .locator("#list")
      .getByRole("button", { name: "Android original" })
      .click();
    await page
      .getByRole("textbox", { name: "Entry text" })
      .fill("PC saved edit");
    await page.getByRole("button", { name: "Save text", exact: true }).click();
    await expect(page.locator("#message")).toContainText("Saved on PC");
    await syncNow(phone.repo, rpc);
    expect((await phone.repo.readSnapshot()).entries[0].text).toBe(
      "PC saved edit",
    );
    await page
      .getByRole("textbox", { name: "Entry text" })
      .fill("stale PC draft");
    await phone.repo.editEntry("entry_seed", "newer Android edit");
    await syncNow(phone.repo, rpc);
    await page.getByRole("button", { name: "Save text", exact: true }).click();
    await expect(page.locator("#message")).toContainText("changed while");
    await expect(page.getByRole("textbox", { name: "Entry text" })).toHaveValue(
      "stale PC draft",
    );
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reload", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Entry text" })).toHaveValue(
      "newer Android edit",
    );
    await page
      .locator("summary")
      .filter({ hasText: "Original capture" })
      .click();
    await expect(page.locator("#detail pre")).toContainText("Android original");
    page.once("dialog", (d) => d.accept("From PC"));
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await expect(page.locator("#list")).toContainText("From PC");
    page.once("dialog", (d) => d.accept("Ideas"));
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    await expect(page.locator("#folder")).toContainText("Ideas");
    await page
      .locator("#list")
      .getByRole("button", { name: "From PC", exact: true })
      .click();
    await page
      .getByLabel("Note folder", { exact: true })
      .selectOption({ label: "Ideas" });
    await page.getByRole("button", { name: "Move note", exact: true }).click();
    await syncNow(phone.repo, rpc);
    expect(
      (await phone.repo.readSnapshot()).entries.find(
        (e) => e.text === "From PC",
      )!.folderId,
    ).toBeTruthy();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.locator("#detail")).toContainText("Restore");
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await syncNow(phone.repo, rpc);
    expect(
      (await phone.repo.readSnapshot()).entries.find(
        (e) => e.text === "From PC",
      )!.removed,
    ).toBe(false);
    await page.getByRole("button", { name: "Tasks", exact: true }).click();
    page.once("dialog", (d) => d.accept("PC task"));
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .locator("#list")
      .getByRole("button", { name: /PC task/ })
      .click();
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await syncNow(phone.repo, rpc);
    expect(
      (await phone.repo.readSnapshot()).tasks.find(
        (t) => t.title === "PC task",
      )!.status,
    ).toBe("completed");
  } finally {
    await b.close();
    await h.close();
    phone.db.close();
  }
});
test("Android browser UI exchanges with actual PC server through a test HTTPS adapter", async () => {
  const h = await pc(),
    b = await browser();
  try {
    const context = await b.newContext();
    const page = await context.newPage();
    // This adapter forwards test HTTPS requests to the real localhost HTTP server.
    // It does not validate certificates, Tailscale or a physical Android network.
    await page.route("https://pc.noeting.ts.net/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "authorization,content-type",
            "Access-Control-Allow-Methods": "POST",
          },
        });
      const path = new URL(req.url()).pathname;
      const response = await fetch(h.url + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: req.postData(),
      });
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: await response.text(),
      });
    });
    await page.goto("http://127.0.0.1:8081");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Note text", exact: true })
      .fill("Browser phone original");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Back", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    async function panel() {
      await page
        .getByRole("button", { name: "More notes options", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Sync with PC", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "PC HTTPS address" })
        .fill("https://pc.noeting.ts.net/");
      await page.getByRole("textbox", { name: "PC pairing token" }).fill(token);
    }
    await panel();
    await page
      .getByRole("button", { name: "Initialize empty PC from Android" })
      .click();
    await expect(page.getByRole("alert")).toContainText("Sync complete");
    const pcPage = await context.newPage();
    await login(pcPage, h.url);
    await pcPage
      .locator("#list")
      .getByRole("button", { name: "Browser phone original" })
      .click();
    await pcPage
      .getByRole("textbox", { name: "Entry text" })
      .fill("PC to Android browser");
    await pcPage
      .getByRole("button", { name: "Save text", exact: true })
      .click();
    await expect(pcPage.locator("#message")).toContainText("Saved on PC");
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Sync complete");
    await page
      .getByRole("button", { name: "Disconnect / close PC sync" })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Open note: PC to Android browser",
        exact: true,
      }),
    ).toBeVisible();
    await panel();
    await expect(
      page.getByRole("textbox", { name: "PC pairing token" }),
    ).toHaveValue(token);
    await page
      .getByRole("button", { name: "Disconnect / close PC sync" })
      .click();
    await page
      .getByRole("button", { name: "More notes options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sync with PC", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "PC pairing token" }),
    ).toHaveValue("");
  } finally {
    await b.close();
    await h.close();
  }
});
