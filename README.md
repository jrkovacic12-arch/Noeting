# Noeting

**Notice. Note. Think. Originate from nothing.**

Noeting is an early-stage, local-first personal thinking and action app. Its goal is to help people capture thoughts, distinguish ideas from commitments, choose what matters, reflect, and return to life outside the app—without an endless feed, streak pressure, or automatic AI conversations.

The product has two optional, connected loops:

- **Thinking:** Notice → Capture → Reflect → Connect → Experiment/Create → Revisit → Stop
- **Action:** Capture → Clarify → Prioritize → Act → Review → Stop

Neither loop requires the other. A Note is not automatically a Task, and a completed Task does not require a reflection.

## Project status

**As documented on October 13, 2026:** The first **M1 Capture → Today** implementation exists in source. Native Android compilation/static APK verification and physical-device offline-restart acceptance remain **pending**. This repository does **not** claim a validated standalone Android APK or a released mobile app.

| Area | Current state |
| --- | --- |
| Note/Task Capture | Implemented in the M1 Expo/React Native source |
| Task completion and up to three pins | Implemented in M1 |
| Local SQLite persistence | Implemented; host and browser tests recorded |
| Library search, Review, linked Reflect/Create | Planned V1 work; not implemented in native M1 |
| Today note and deterministic daily overview | Planned V1 work |
| Device reminders and user-readable export/restore | Planned V1 work; not implemented |
| AI, accounts, sync, autonomous agent | Outside V1 |

M1 stores Notes but currently displays only their **count** in the Today UI. The historical HTML prototype contains more illustrative workflows than the native M1 application.

For **verified progress, blockers, and the sole current next action**, see [06_CURRENT_STATE.md](06_CURRENT_STATE.md). Do not infer feature completion from a roadmap item or prototype screenshot.

## Technology

- React Native + Expo + TypeScript
- `expo-sqlite` for the on-device database
- No account or backend required for the current core workflow
- Android as the first target for physical-device M1 validation; iOS remains part of the V1 platform direction

The source of truth for exact versions, persistence, and security boundaries is [03_ARCHITECTURE.md](03_ARCHITECTURE.md).

## Running the project

Install dependencies and run the local code checks:

```sh
npm ci
npm run check
npm run export
```

The check command runs TypeScript checking and SQLite-backed repository tests. `npm run export` checks JavaScript exports; neither is a native APK or device acceptance test.

For the **development web validation target**:

```sh
npm run web
```

This uses Expo SQLite's web storage and the repository's server with the required cross-origin-isolation headers. The recorded browser validation covers persistence across a browser restart and offline capture in an **already loaded** app; it does not establish an offline browser cold start or native Android behavior.

The repository also defines `npm run test:ui` for Playwright UI tests; run it separately with the web server available. Existing test results are documented in [06_CURRENT_STATE.md](06_CURRENT_STATE.md).

For the Android test APK, the project has a preparation/build wrapper:

```sh
npm run build:android:test
```

This requires the supported Android/Java toolchain and dependency access described in the project documentation. The expected test artifact is `artifacts/noeting-m1-android-arm64-test.apk`, **only if** compilation and static verification succeed. A successful static check still requires actual Android-device acceptance per [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). The test build uses development signing and placeholder identifiers, not production-release credentials.

## Privacy and data ownership — current limits

Noeting's direction is privacy-first and local-first, but **M1 uses unencrypted SQLite**. Android automatic backup is disabled in configuration, while final device/manifest enforcement and iOS backup behavior are unverified. User-readable export, restore, and encryption policy are unresolved. **Do not treat this early build as the sole durable copy of irreplaceable notes.** There is no approved cloud AI processing or autonomous action in V1.

## Documentation

Start with [00_START_HERE.md](00_START_HERE.md) for contributor/session reading order and document ownership. The project maintains one authoritative file per topic:

| Document | Purpose |
| --- | --- |
| [01_VISION.md](01_VISION.md) | Founding principles and the two loops |
| [02_PRODUCT.md](02_PRODUCT.md) | User needs, accepted V1 direction, candidate workflows |
| [03_ARCHITECTURE.md](03_ARCHITECTURE.md) | Stack, persistence, technical and privacy boundaries |
| [04_ROADMAP.md](04_ROADMAP.md) | Phases, proposed sequencing, milestone evidence |
| [05_DECISIONS.md](05_DECISIONS.md) | Accepted decisions, proposals, open questions |
| [06_CURRENT_STATE.md](06_CURRENT_STATE.md) | Verified progress, blockers, sole exact next action |
| [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md) | Illustrative scenarios and pending acceptance checklists |
| [CHANGELOG.md](CHANGELOG.md) | Dated project/documentation history |
| [archive/noeting-original.md](archive/noeting-original.md) | Preserved founding note |

The [interactive HTML prototype](noeting_capture_today_prototype.html) and [desktop](noeting_v12_desktop.png) / [mobile](noeting_v12_mobile.png) screenshots are **historical research artifacts**, not screenshots or acceptance evidence for the native M1 app.
