# Noeting — Decision Log

> **Purpose:** Preserve what was decided and why; distinguish foundational direction from unaccepted technical/product proposals.
>
> **Status vocabulary:** `Accepted direction` · `Proposed` · `Open` · `Superseded`. An accepted direction does not mean implementation is complete.

## D-001 — Attention and original thought remain foundational

- **Date recorded:** 2026-10-10 (original concept predates this record; precise original date unspecified)
- **Status:** Accepted direction
- **Decision:** Noeting must protect sustained attention, favor rapid capture and reflection, and encourage creation over consumption. Interfaces should have a natural stopping point.
- **Why:** This is the founding concept in the original note.
- **Consequences:** No infinite feeds, streak pressure, default AI chatter, or forced engagement loops.
- **Reference:** [01_VISION.md](01_VISION.md), [authentic original note](archive/noeting-original.md)

## D-002 — Expand beyond thought capture to task clarity

- **Date recorded:** 2026-10-10
- **Status:** Accepted direction
- **Decision:** Account for plans, to-dos, categorization, daily summaries, priority management, and reminders alongside thoughts and reflection.
- **Why:** Obsidian usage demonstrated these as the user's real activities and unmet needs; task overload is a current problem.
- **Consequences:** The product requires an **action loop** in addition to a **thinking loop**. Task objects must be distinct from speculative ideas.
- **Reference:** [02_PRODUCT.md](02_PRODUCT.md)

## D-003 — Noeting is the preferred long-term project direction

- **Date recorded:** 2026-10-10
- **Status:** Accepted direction, subject to validation
- **Decision:** Pursue Noeting as a standalone long-term system rather than committing to Obsidian community plugins as the permanent architecture.
- **Why:** The future personal-agent ambition needs explicit control over data, AI execution, tool permissions, and workflows.
- **Consequences:** Obsidian remains a temporary working tool, reference point, and possible import source. Building a separate app still needs user-value validation; superiority is not assumed.

## D-004 — Privacy-first, local-first is an architectural goal

- **Date recorded:** 2026-10-10
- **Status:** Accepted direction
- **Decision:** Prioritize local data ownership, offline core use, data portability, optional sync, and bounded external data sharing.
- **Why:** Privacy is an explicit reason for the long-term agent direction and an original technical principle.
- **Consequences:** AI provider and encryption design remain open; D-011 subsequently selects the V1 mobile stack. “Local-first” alone is not a proven security guarantee.
- **Reference:** [03_ARCHITECTURE.md](03_ARCHITECTURE.md)

## D-005 — Agent capability should expand incrementally

- **Date recorded:** 2026-10-10
- **Status:** Accepted direction
- **Decision:** Start with narrow, understandable capabilities (capture/categorize/organize/summarize/remind), then investigate contextual help, integrations, and authorized actions.
- **Why:** The user's personal-agent ambition begins with practical information and task management.
- **Consequences:** Do not make a general autonomous agent a prerequisite for V1. Concrete feature order remains a planning proposal.

## D-006 — Keep separate project files for cross-session continuity

- **Date recorded:** 2026-10-10
- **Status:** Accepted direction
- **Decision:** Maintain seven linked Markdown files plus an archived copy of the original note.
- **Why:** Future sessions need durable identity, specifications, decisions, roadmap, and verified current state without rereading chat history.
- **Consequences:** Each topic has one authoritative file; `06_CURRENT_STATE.md` is updated at handoff. The separate `07_V1_WORKFLOW_DRAFT.md` is a later working artifact, not a silent revision of this 2026-10-10 decision.

---

## D-007 — Simplify Capture and Today in the research wireframe

- **Date recorded:** 2026-10-12
- **Status:** Accepted **for the current prototype iteration only**, not an approved V1 specification.
- **Decision:** Capture exposes only **Note / Task**; manually saving a Task adds it to Today; Today includes **+ Add task** preselected to Task; **Think, then return** has no **Skip for today** button; user-facing **Tasks** replaces **Commitments**.
- **Why:** Direct user feedback requested fewer choices, clearer task entry, and simpler wording.
- **Consequences:** Continue to protect original note text; AI/derived task suggestions require deliberate acceptance; older entry categories remain readable. Whether this is the final V1 taxonomy or navigation still requires real-life testing.
- **Reference:** [02_PRODUCT.md](02_PRODUCT.md), [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md)

## D-008 — Remove duplicated navigation and priority surfaces in the research wireframe

- **Date recorded:** 2026-10-12
- **Status:** Accepted **for prototype V1.2 only**; production UX remains unvalidated.
- **Decision:** Keep one header Capture control, remove duplicate navigation/Library Capture actions, and replace the separate My priorities panel with up to three pinned tasks at the top of a single Tasks list. Consolidate repeated daily counts into one summary; hide unassigned dates and collapse demo controls by default.
- **Why:** The user identified duplicate Capture entry points and duplicated task rows, and explicitly approved simplification.
- **Consequences:** Tasks retain their user-selected `priority` state for compatibility; pin/unpin changes only ordering, not task identity or due dates. Continue testing real-life usability before locking V1.
- **Reference:** [02_PRODUCT.md](02_PRODUCT.md), [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md)

## D-009 — Use shorter action labels in the research wireframe

- **Date recorded:** 2026-10-12
- **Status:** Accepted **for the current prototype only**; production UX remains unvalidated.
- **Decision:** Relabel **Develop into creation → Create**, **Add reflection → Reflect**, **Choose for Today → Today note**, and **Make task → New task** where those actions appear. The Today panel already used Reflect.
- **Why:** The user reported testing and directly requested the four wording changes.
- **Alternatives considered:** Keep longer descriptive labels; rejected for this prototype iteration in favor of the user's explicit shorter wording.
- **Consequences:** Preserve all existing action handlers and confirmation requirements; this does not approve a different task lifecycle or finalize V1.
- **Reference:** [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md)

## D-010 — Adopt the first working app feature scope and staged delivery

- **Date recorded:** 2026-10-12
- **Status:** Accepted V1 direction; M1 source implemented on 2026-10-13, with remaining V1 implementation and device acceptance pending.
- **Decision:** Build a local-first mobile app covering **Capture** (Note / Task, immediate close), **Today** (one task list, edit/complete, up to three pinned tasks, optional Today note), **Library** (search/filter/edit/delete), **Review** (Reflect/Create as deliberate linked entries), **user-set reminders**, a **deterministic daily overview**, and **export/backup**. Core note/task operation works offline and requires no account. **AI is not needed in V1**.
- **Why:** The user instructed that the previously recommended first-app feature set be used, reported that the updated prototype worked as intended, and selected implementation as the next step.
- **Consequences:** This is a high-level feature boundary, **not** evidence of reliability or a fully signed-off specification. Deliver incrementally: M1 focuses on local Capture → Today persistence before Library/Review, reminders, and export. No default feed, AI chatter, silent commitment creation, sync, or agent execution.
- **Reference:** [02_PRODUCT.md](02_PRODUCT.md), [04_ROADMAP.md](04_ROADMAP.md)

## D-011 — Adopt React Native, Expo, TypeScript, and SQLite for mobile V1

- **Date recorded:** 2026-10-12
- **Status:** Accepted stack selection. No project had been initialized when this decision was recorded; the M1 project was initialized on 2026-10-13 (see `06_CURRENT_STATE.md`).
- **Decision:** Use **React Native + Expo + TypeScript**, with **on-device SQLite** as the primary persistent database. Target mobile first, with Android/iOS support. Begin implementation using **Codex**.
- **Why:** The user explicitly agreed to the recommended stack and stated they would implement the app with Codex.
- **Alternatives considered:** Capacitor with the existing HTML prototype; declined in favor of the recommended React Native/Expo approach for a native mobile app.
- **Consequences:** The HTML/JS wireframe is a **behavior and design reference**, not directly reusable native UI code. Expo Router, `expo-sqlite`, Expo Notifications, and file export/sharing are **suggested packages**; exact versions, plugin configuration, schema, security controls, and first test device remain implementation details to verify. No backend is needed for core V1.
- **Reference:** [03_ARCHITECTURE.md](03_ARCHITECTURE.md), [04_ROADMAP.md](04_ROADMAP.md)

## Proposals to evaluate — not accepted decisions

### P-001 — Bounded background AI

- **Status:** Proposed
- **Question:** Can opt-in background categorization and daily summaries coexist with the original principle that AI should be explicitly summoned?
- **Candidate policy:** User configures scope/frequency; no automatic chat; original captures remain intact; no autonomous execution.
- **Evidence needed:** UX/privacy test and user choice.

### P-002 — Minimal task and summary experience

- **Status:** Proposed
- **Candidate:** Today includes a finite brief, known deadlines, and up to three user-confirmed priorities.
- **Evidence needed:** Actual task-flow testing and evidence that this reduces overwhelm rather than hides important work.

### P-003 — Architecture layering and data model

- **Status:** Proposed
- **Candidate:** Separate local domain data, deterministic scheduling, replaceable AI, and permission-controlled agent tools.
- **Evidence needed:** Chosen platform, threat model, prototype, and implementation trade-offs.

### P-004 — Permissioned AI suggestions (2026-10-11; later research after D-010)

- **Status:** Proposed for later research; excluded from V1 by D-010. The user explicitly allows AI to suggest and request permission; exact triggers, features, consent scope, and implementation are not yet approved.
- **Candidate policy:** No silent commitment or scheduling; separately authorized background processing. User-visible behavior is specified provisionally in [02_PRODUCT.md](02_PRODUCT.md), with scenarios in [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md).
- **Evidence needed:** Test user approval/consent interactions and determine scope before acceptance.

### P-005 — Optional handoffs between thinking and action (2026-10-12)

- **Status:** Proposed workflow interpretation; user authorized documentation changes, **not** a finalized V1 specification or additional mandatory features.
- **Candidate:** Treat the existing thinking and action loops as independently useful but voluntarily connected. A thought/reflection may lead to an experiment or user-accepted task; a completed action may inform a later, separately authored reflection or creation.
- **Constraints:** No automatic task promotion, mandatory post-task reflection, new default AI prompt, separate Create screen, or new schema object implied. Protect unchanged source text and accepted task state.
- **Alternatives considered:** Keep loops entirely separate (limits learning from action); prescribe one continuous think → act → reflect sequence (creates unwanted friction).
- **Evidence needed:** Observe proposed S6–S7 transitions and independent loop use during real-life workflow testing; decide which, if any, belong in V1.
- **Reference:** [01_VISION.md](01_VISION.md), [02_PRODUCT.md](02_PRODUCT.md), [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md)

### P-006 — Minimal M1 implementation choices (2026-10-13; implemented, device evaluation pending)

- **Status:** Implementation choices made within the authorized M1 slice; implemented in source and exercised by real-SQLite automated checks. These choices do not create new historical user acceptance of detailed UX or pass physical-device evaluation.
- **Implemented:** The behavior contract in [02_PRODUCT.md](02_PRODUCT.md) and persistence contract in [03_ARCHITECTURE.md](03_ARCHITECTURE.md): Pending/Completed only, persistent pins on pending tasks, immutable original text, atomic linked saves, retry deduplication, and recoverable failed-save UI. Schema v1 uses `entries` / `tasks` in `noeting.db`.
- **Device/configuration choices:** The user confirmed Android as the first physical validation target on 2026-10-13. Resolved SDK/package versions and the protective Android `allowBackup: false` default are recorded in `03_ARCHITECTURE.md`; native build/device compatibility remains unverified.
- **Evidence still needed:** The physical-device M1 gate in [04_ROADMAP.md](04_ROADMAP.md); actual automated evidence is in `06_CURRENT_STATE.md`. Deferment, dates/reminders, edit/delete semantics, encryption/iOS backup policy, and cross-loop additions remain separate unresolved work.

## Open decisions

| ID | Question | Owner/status |
| --- | --- | --- |
| O-001 | Are the detailed V1 acceptance criteria and lifecycle semantics complete? High-level feature scope approved; **no AI in V1**. | Partly resolved; details open |
| O-002 | Mobile stack/SDK versions recorded in `03_ARCHITECTURE.md`; Android is the user-confirmed first physical target (P-006); exact test device / native compatibility? | Stack/versions resolved; device validation pending |
| O-003 | What category/type taxonomy is understandable in use? | Open |
| O-004 | What is the precise data-sharing and on-device/cloud AI policy? | Open |
| O-005 | How are reminders, importance, urgency, and user-confirmed priorities represented? | Open |
| O-006 | What is the local security threat model and encryption approach? | Open |
| O-007 | When, if ever, does Noeting need external integrations, desktop, or sync? | Open |
| O-008 | How should a user-accepted Task derived from an existing Note preserve provenance without rewriting the Note, given the M1 trigger requires a Task-kind Entry? Decide relationship, migration, retry, and deletion rules before implementing that flow. | Open — design alternatives only; no schema change approved |

**Recording future decisions:** Use a new `D-###` entry with date, status, choice, alternatives considered, rationale, and consequences. If a decision changes, mark the older entry `Superseded` rather than silently rewriting history.
