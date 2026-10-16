# Noeting

**Notice. Note. Think. Originate from nothing.**

Noeting is a minimal, local-first Notes and Tasks app built with React Native, Expo, TypeScript and SQLite. Xiaomi Notes is an interface reference: quiet lists, quick capture and focused writing.

## Current source — 0.9.0 (draft PR #6 refinement)

- **Notes:** searchable list and full-screen writing-first detail/editor, compact Edit/Link/More actions, explicit Save/Cancel, Copy and original-capture access.
- **Intentional links:** only Note detail creates a linked Note or root Task. Task-source Note previews/navigation are read-only; Tasks never create generic links.
- **Tasks:** searchable root list with direct Complete/Reopen and progress; text and + open compact expandable bottom sheets.
- **Subtasks:** one level, independent text/completion, edit/remove/Undo; child search reveals its parent. Surviving children of a removed parent stay accessible with `Parent removed`, without changing stored ownership.
- **Drafts and appearance:** local draft recovery after dismissal/restart; explicit Cancel discards. Follows system theme and preserves old appearance preferences.

Schema v8 adds `parent_task_id` without converting existing generic links into hierarchy. Historical v6/v7 captures, edits, source relationships and task states remain preserved. Schedule retirement and legacy notification cleanup remain intact. No AI, accounts, sync, backend or actual Xiaomi integration is added.

Current checks, fresh APK identity and native/device acceptance limits live in [06_CURRENT_STATE.md](06_CURRENT_STATE.md). The older 0.8.0 test APK does not validate this redesign. PR #6 remains draft pending review and native/device acceptance.

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
