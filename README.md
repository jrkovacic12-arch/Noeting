# Noeting

**Notice. Note. Think. Originate from nothing.**

Noeting is a minimal, local-first Notes and Tasks app built with React Native, Expo, TypeScript and SQLite. Xiaomi Notes is an interface reference: quiet lists, quick capture and focused writing.

## Current source — 0.10.2 (PR #6 ready for review)

- **Folders:** header icon opens the dedicated management screen. Long-press selects folders for Pin/Unpin, Delete or single-folder Edit; deleting folders preserves their notes. Quick bar remains All → pinned/other user folders → Uncategorized.
- **Notes:** compact responsive cards, scoped folder search, folders, long-press selection and atomic Pin/Unpin/Move/Remove with Undo and Recently deleted recovery.
- **Direct writing:** existing Note/Task/child text edits inline with autosave, Unsaved/Retry and automatically restored contextual drafts. Original captures remain intact; no Edit or Resume buttons.
- **Intentional links:** Note-only creation, frozen provenance and read-only Task-source Note navigation. Existing connections appear in Note More; options overlay content without shifting it.
- **Tasks:** compact expandable sheets, Enter-driven child entry, indented grouped/collapsible lists and Completed section. Parent/child completion synchronizes transactionally; removed-parent fallback retains access.
- **Appearance:** circular +, immediate scrim, accessible controls and system theme. Exactly Notes/Tasks tabs.

Additive schemas v9/v10 separate Note organization from historical Task pins and preserve v6/v7/v8/v9 captures, edits, links, hierarchy and removal history. SQLite/drafts remain unencrypted; export/restore is deferred. No AI, accounts, sync, scheduling or Xiaomi dependency.

Current checks, fresh APK identity and **blocking unverified native/device acceptance** live in [06_CURRENT_STATE.md](06_CURRENT_STATE.md). Older APKs do not validate the current source. The user requested finalization for review; native acceptance remains required before merge/release, and no production readiness is claimed.

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

SQLite is local and **unencrypted**. Android automatic backup is disabled in configuration; device enforcement and iOS backup behavior remain unverified. Backup/export/restore is deferred to the later account phase (D-018). Do not use this early build as the sole durable copy of irreplaceable notes.

## Project documents

Start with [00_START_HERE.md](00_START_HERE.md) and [06_CURRENT_STATE.md](06_CURRENT_STATE.md). Product behavior lives in [02_PRODUCT.md](02_PRODUCT.md), architecture/migration constraints in [03_ARCHITECTURE.md](03_ARCHITECTURE.md), implementation stages in [04_ROADMAP.md](04_ROADMAP.md), decisions in [05_DECISIONS.md](05_DECISIONS.md), and acceptance scenarios in [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). [01_VISION.md](01_VISION.md) and [archive/noeting-original.md](archive/noeting-original.md) preserve the founding principles.

Brand originals remain unchanged in `assets/brand/source/`; generated launcher assets live in `assets/brand/generated/`. The HTML prototype and v12 screenshots are historical research artifacts.
