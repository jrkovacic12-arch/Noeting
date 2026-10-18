# Noeting

**Notice. Note. Think. Originate from nothing.**

Noeting is a minimal, local-first Notes and Tasks app built with React Native, Expo, TypeScript and SQLite. Xiaomi Notes is an interface reference: quiet lists, quick capture and focused writing.

## Current source — 0.10.3/code 20/schema v10 (PRs #8 and #9 merged)

- **Folders:** header icon opens the dedicated management screen. Long-press selects folders for Pin/Unpin, Delete or single-folder Edit; deleting folders preserves their notes. Quick bar remains All → pinned/other user folders → Uncategorized.
- **Notes:** compact responsive cards, scoped folder search, folders, long-press selection and atomic Pin/Unpin/Move/Remove with Undo and Recently deleted recovery.
- **Direct writing:** existing Note/Task/child text edits inline with autosave, Unsaved/Retry and automatically restored contextual drafts. Original captures remain intact; no Edit or Resume buttons.
- **Intentional links:** Note-only creation, frozen provenance and read-only Task-source Note navigation. Existing connections appear in Note More; options overlay content without shifting it.
- **Tasks:** compact expandable sheets, Enter-driven child entry, indented grouped/collapsible lists and Completed section. Parent/child completion synchronizes transactionally; removed-parent fallback retains access.
- **Appearance:** circular +, immediate scrim, accessible controls and system theme. Exactly Notes/Tasks tabs.

Additive schemas v9/v10 separate Note organization from historical Task pins and preserve v6/v7/v8/v9 captures, edits, links, hierarchy and removal history. SQLite/drafts remain unencrypted; export/restore is deferred. No AI, accounts, sync, scheduling or Xiaomi dependency.

Current CI, matching APK identity and Android acceptance status live in [06_CURRENT_STATE.md](06_CURRENT_STATE.md). PRs #8 and #9 merged into `main` on 2026-10-18 and the latest main CI passed. The user subsequently confirmed **all N1–N9 physical-device checks fully completed successfully** on the 0.10.3 test APK. This is a user-reported PASS across all nine cases; individual device/test artifacts were not supplied, and it is **not production-release sign-off**.

## Run and verify

```sh
npm ci
npm run check
npm run web
```

With the web server running, `npm run test:ui` checks real browser SQLite workflows. `npm run export` checks JavaScript exports; it does not validate native behavior.

```sh
npm run build:android:test
```

The Android wrapper builds and statically verifies an ARM64 development-signed test APK at `artifacts/noeting-m1-android-arm64-test.apk`. Static verification is separate from actual phone acceptance. Install over an existing compatible Noeting test build without uninstalling to retain its local data; confirm the signer before distributing builds.

## Privacy and durability

SQLite is local and **unencrypted**. Android automatic backup is disabled in configuration; device enforcement and iOS backup behavior remain unverified. Backup/export/restore is deferred to the later account phase (D-018). **Current user-confirmed scope: disposable test data only; its loss is acceptable during this phase, so backup is not the next development priority.** This does not make the app suitable as the sole durable copy of irreplaceable notes.

## Project documents

Start with [00_START_HERE.md](00_START_HERE.md) and [06_CURRENT_STATE.md](06_CURRENT_STATE.md). Product behavior lives in [02_PRODUCT.md](02_PRODUCT.md), architecture/migration constraints in [03_ARCHITECTURE.md](03_ARCHITECTURE.md), implementation stages in [04_ROADMAP.md](04_ROADMAP.md), decisions in [05_DECISIONS.md](05_DECISIONS.md), and acceptance scenarios in [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). [01_VISION.md](01_VISION.md) and [archive/noeting-original.md](archive/noeting-original.md) preserve the founding principles.

Brand originals remain unchanged in `assets/brand/source/`; generated launcher assets live in `assets/brand/generated/`. The HTML prototype and v12 screenshots are historical research artifacts.


## Quality checks and CI

`Noeting quality` runs on PRs and pushes to `main`: Node 24, `npm ci`, `npm run check`, real SQLite/WASM browser tests, then all-platform `npm run export`. Superseded runs cancel. Failure artifacts retain synthetic-test traces, screenshots and server logs for seven days. Tests use temporary isolated Chromium profiles, never a personal app database.

Local equivalent (Node 24):

```sh
npm ci
npm run check
npx playwright install --with-deps chromium
npm run web
# Separate terminal, after http://127.0.0.1:8081 is reachable:
npm run test:ui
npm run export
```

`CHROMIUM_PATH=/path/to/chromium` selects an existing browser; CI uses Playwright's installed revision. The server supplies SQLite's COOP/COEP isolation headers. Exports are not native APK builds or device tests.

An administrator can require **Noeting quality / TypeScript, SQLite and browser** on `main` in Settings → Rules → Rulesets (or branch protection), require PRs, and block pending/failed checks. Select the actual check after its first run. No repository settings are changed here; run status belongs to `06_CURRENT_STATE.md`.

Android release-candidate compilation remains optional/manual: `npm run build:android:test`, then the existing `npm run verify:android:apk` script (consult its arguments). It requires the established SDK/JDK and local signing setup. CI neither uploads signing material nor builds an APK. Record static verification and per-scenario device acceptance separately.


## Synthetic performance procedure

From the repository root with Node 24 and installed dependencies:

```sh
node --expose-gc --import tsx scripts/benchmark.ts
# With npm run web already serving the current export:
npm run test:ui -- --grep 'benchmark 3000|draft write measurement'
```

Both use only generated data. The shared SQL fixture creates 3,000 Notes and 1,000 parent/child groups (5,000 entries total). The Node benchmark uses a temporary real SQLite file and reports 20-run median/p95 wall time, driver call counts and an approximate retained heap delta (GC when available). Driver writes include transaction/PRAGMA calls, not just row modifications; heap delta is not native SQLite/Android memory. Browser output includes UI/automation latency, startup, searches, detail, save, tab/folder switching and ten scroll steps, plus a bounded rendered-row assertion. Run comparisons on the same machine; browser runs are single samples and are not frame-rate or device benchmarks. Current evidence and no-change finding belong to `06_CURRENT_STATE.md`.
