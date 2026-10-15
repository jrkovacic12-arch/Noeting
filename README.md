# Noeting

**Notice. Note. Think. Originate from nothing.**

Noeting is an early-stage, local-first personal thinking and action app. Its goal is to help people capture thoughts, distinguish ideas from commitments, choose what matters, reflect, and return to life outside the app—without an endless feed, streak pressure, or automatic AI conversations.

Users close the app when they choose; there is no Finish session, Enough for today, or explicit-stop flow. The product has two optional, connected loops:

- **Thinking:** Notice → Capture → Reflect → Connect → Experiment/Create → Revisit
- **Action:** Capture → Clarify → Prioritize → Act → Review

Neither loop requires the other. A Note is not automatically a Task, and a completed Task does not require a reflection.

## Project status

**As documented on October 15, 2026:** Version **0.4.0** implements Capture, Today, Library, basic Review and Settings with schema v3. Settings offers locally saved Light, Dark and Same as system appearance; system changes apply live. Android compilation and static APK verification **passed**. Native Android 9 in-place upgrade, Today/Reflect/Create/Review and offline reboot checks **passed for 0.2.0**. Version 0.2.1 styling passed browser workflows and layout checks at three phone widths; native visual acceptance is pending. Version 0.2.2 removed the starter icon guides and draft startup grid. Version 0.2.3 added supplied symbol branding. Version 0.3.0 adds the approved editing, recoverable removal and navigation changes; eighteen SQLite and twelve browser checks passed. Version 0.3.1 implements D-015 bottom tools, dismissal, Save labels, Back handling and compact Undo. Fourteen browser workflows passed; its Android verification is partial (Back/forms/sheet/clipboard verified, full edit/Undo/relaunch automation incomplete). Physical-device acceptance remains **pending**; these are development-signed test builds, not a released mobile app.

| Area | Current state |
| --- | --- |
| Note/Task Capture | Implemented in the M1 Expo/React Native source |
| Task completion and up to three pins | Implemented in M1 |
| Local SQLite persistence | Implemented; host and browser tests recorded |
| Library search/filter | Read-only slice implemented; see current validation evidence |
| Review, linked Reflect/Create | Implemented; preserve original source entries |
| Today note and deterministic daily overview | Persistent chosen note with Reflect/Create/Change and visible summary card |
| Device reminders and user-readable export/restore | Planned V1 work; not implemented |
| AI, accounts, sync, autonomous agent | Outside V1 |

Today displays the saved-note count; the Library tab retrieves Notes, Tasks and linked thinking, searches original text, filters by type, and shows task status/source links. Version 0.2.0 adds compact right-edge pin icons, a persistent Today note, a summary card and Review. The historical HTML prototype contains more illustrative workflows than the native M1 application.

Brand originals (both SVG and EPS logo/symbol pairs) live unchanged in `assets/brand/source/`. The app uses the symbol for launcher icons, favicon and the header. PNG runtime assets live in `assets/brand/generated/`; regenerate them with `python3 scripts/render-brand-assets.py` using Inkscape and Pillow. Adaptive foreground padding retains the complete symbol and its dot. The plain Android startup theme remains unchanged.

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

For the ARM64 Android test APK, the project has a preparation/build wrapper:

```sh
npm run build:android:test
```

This requires the supported Android/Java toolchain and dependency access described in the project documentation. The current verified ARM64 phone artifact is `artifacts/noeting-m1-android-arm64-test.apk`; it is version **0.4.0/code 10** with automatic Today-note selection, edit/remove/Undo, long-press Copy tools, X closers and scrolling icon navigation. The historical filename is retained by the wrapper; the current download link is maintained in `06_CURRENT_STATE.md`. The retained 0.3.1 emulator artifact is `artifacts/noeting-m1-android-x86_64-test.apk`, built with `npm run build:android:test -- --abi=x86_64`. Artifact identities and native emulator evidence are recorded in `06_CURRENT_STATE.md`. A successful static check still requires actual Android-device acceptance per [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). The test build uses development signing and placeholder identifiers, not production-release credentials.

## Privacy and data ownership — current limits

Noeting's direction is privacy-first and local-first, but **M1 uses unencrypted SQLite**. Android automatic backup is disabled in configuration, and confirmed in the merged APK manifest; device enforcement and iOS backup behavior remain unverified. User-readable export, restore, and encryption policy are unresolved. **Do not treat this early build as the sole durable copy of irreplaceable notes.** There is no approved cloud AI processing or autonomous action in V1.

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
