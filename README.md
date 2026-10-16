# Noeting

**Notice. Note. Think. Originate from nothing.**

Noeting is a minimal, local-first Notes and Tasks app built with React Native, Expo, TypeScript and SQLite. Xiaomi Notes is an interface reference: quiet lists, quick capture and focused writing.

## Current source — 0.8.0

- **Notes and Tasks:** two searchable tabs, each with + for standalone capture.
- **Entry details:** read, edit, remove with Undo, and navigate sources/linked entries.
- **Intentional links:** Link note or Link task from an existing entry's details. All four Note/Task combinations create independent entries.
- **Tasks:** Complete/Reopen without confirmation or cascading changes to children.
- **Appearance:** follows the system. Existing appearance preferences remain stored.

Writing needs no Reflection/Creation classification. Historical linked writing appears as ordinary Notes. Today, Review, daily summaries, pin/schedule controls and Settings navigation are retired.

Schema v7 preserves existing v6 records, immutable captures, edits, source links and task history, adds generic source snapshots and parks pending pin schedules. Saving a Note no longer selects it for Today. Legacy notification cancellation remains as upgrade cleanup. There is no AI, account, sync or backend requirement.

TypeScript, real SQLite and browser checks are recorded in [06_CURRENT_STATE.md](06_CURRENT_STATE.md), along with Android build status and remaining device acceptance. Earlier 0.7.1 phone approval does not validate this refactor.

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
