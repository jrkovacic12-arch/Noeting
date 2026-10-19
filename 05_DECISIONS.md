# Noeting — Decision Log

> **Purpose:** Preserve what was decided and why; distinguish foundational direction from unaccepted technical/product proposals.
>
> **Historical reading:** D-records preserve decisions and PR instructions as of their date. Current product behavior is in `02_PRODUCT.md`; merged PR status, blockers and actions are owned only by `06_CURRENT_STATE.md`. Do not treat an older draft-PR instruction as current.
>
> **Status vocabulary:** `Accepted direction` · `Proposed` · `Open` · `Superseded`. An accepted direction does not mean implementation is complete.

## D-001 — Attention and original thought remain foundational

- **Date recorded:** 2026-10-10 (original concept predates this record; precise original date unspecified)
- **Status:** Accepted direction; explicit-stop requirement subsequently superseded by D-012
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
- **Status:** Accepted V1 direction; export/backup timing partially superseded by D-018. Current implementation and device evidence live in `06_CURRENT_STATE.md`.
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

## D-012 — Remove explicit stop functionality; users close the app themselves

- **Date:** 2026-10-13
- **Status:** Accepted direction, explicitly requested after phone feedback. Supersedes the explicit-stop portion of D-001/D-010 and the earlier M1 implementation.
- **Decision:** Remove Finish session, Enough for today, deliberate-stop cards, stop screens and related closing prompts. Retain attention protection, local data and user-directed activity without requiring an app-managed stop flow.
- **UX:** Use a compact right-edge pin icon with filled/outlined states; remove Library's combined clear-search/filter control. Add prototype-based Today note with Reflect/Create and Change; use a visible summary card, not a modal/button; include Review.
- **Reference:** `01_VISION.md`, `02_PRODUCT.md`; authentic founding archive remains unchanged as historical source.

## D-013 — Prototype-based thinking and Review implementation

- **Date:** 2026-10-13
- **Status:** Authorized scope following approval and the user's prototype reference; schema details are implementation choices within that scope.
- **Decision:** One chosen non-task entry stays on Today until deliberately changed, matching the prototype. Reflect/Create author separate linked entries; Review shows completed tasks and linked thinking. The summary card shows current open/completed/saved-record totals; no unsupported due dates, AI or invented commitments.
- **Implementation:** Schema v2 adds `thinking_links` and `today_selection` without rebuilding or rewriting existing `entries`/`tasks`. Reflections/creations are note entries with a separate provenance/type link. Saves are atomic and stable-request retries are idempotent; source text is unchanged. Delete/edit and Note-derived Tasks remain later work (O-008 is still open).
- **Consequences:** Preserve existing phone records during upgrade. Build version 0.2.0/code 2 with the same development signer. Real migration/rollback and runtime evidence are maintained in `06_CURRENT_STATE.md`.

## D-014 — Editing, recoverable removal and compact scrolling navigation

- **Date:** 2026-10-14
- **Status:** Accepted after the user reviewed the proposed approach and instructed “proceed.”
- **Decision:** Use X form closers; direct Note saves choose Today automatically and atomically, while linked saves do not. Review has completed-task removal and linked-note edit/removal; Library has edit/removal for all entries. Today Task/note long-press tools expose Copy/Edit/Remove, with accessible activation/actions.
- **Navigation:** Remove top Capture/text tabs, center the supplied symbol/name, and use bottom Today/Library/Review icons with a centered +. Both bars show at the top, on upward scrolling or tab changes; sustained downward motion hides them, with short-page visibility and threshold handling.
- **Data:** Edits change displayed words while keeping the first capture. Removal hides the entry and related direct Task from every list, offers Undo, and never cascades to dependent reflections. Removing Today clears selection. Additive schema v3, unchanged old-row values, atomic failure/retry handling and offline persistence are required. This supersedes D-013's manual-only Today selection behavior. Reminders, export and O-008 remain separate.

## D-015 — Bottom tools, dismissal and Android Back

- **Date:** 2026-10-14
- **Status:** Accepted after review, with the user's final Today-only exit and Undo-label corrections, followed by “Proceed.”
- **Decision:** Toolbox slides from the bottom with only Copy/Edit/Remove action rows; no content, title or X. Forms keep X closers and use “Save.” Outside taps dismiss sheets/forms except during writes. Session-only drafts restore text and stable capture identity when reopened; saving clears the matching draft. Long press is 300 ms and scrolling cancels activation.
- **Back:** Dismiss an open form/sheet first. Library/Review return to the previously visited screen, preserving search/filter and its scroll offset. Only Today arms double-back exit: the first press shows “Press back again to exit.” and the second within two seconds exits. Navigation/opening/dismissing forms resets the countdown.
- **Undo:** Centered small “Undo” control only, with no removal-status sentence. Eight-second timeout and downward swipe dismiss the control while retaining the removal. SQLite schema and removal receipts are unchanged.

## D-016 — Settings and local appearance preference (2026-10-15)

**Accepted:** The user requested a Settings screen with Light, Dark and Same as system, then authorized finalization and a PR. Default to system, apply changes immediately and save the choice locally. A small Settings icon joins the right side of the bottom bar. Use charcoal-green surfaces, warm text and mint accents in dark mode, including forms, toolbox, search, icons and status bar. Retain existing screen history and Today-only double-back exit. Changes save automatically; Settings is a screen rather than a Save form.

**Implementation choices:** SQLite key-value preferences are separate from captured records; loading failure permits app startup with system appearance and a retryable Settings message. Failed saves restore the previous choice. Larger type/density options are future proposals, not included here.

## D-017 — Reopen completed Tasks (2026-10-15)

- **Status:** Accepted; the user approved implementation of the proposed course with “proceed.” Implemented in 0.5.0 source; validation evidence lives in `06_CURRENT_STATE.md`.
- **Decision:** Reopen removes the completed Task from Review and returns the same Task to Today's pending list. No Undo control, confirmation dialog or success prompt. Preserve identity, words, creation time and source links; clear completion time and leave unpinned. Library status and counts reflect the change; persist across restarts. A failed write retains the completed state and reports a retryable error.
- **Why:** The user explicitly corrected the earlier proposal: “do not add Undo control or confirmation for Reopen task. Behaviour is just that it removed from Review and reappear on Today.”
- **Alternatives:** Reopen with temporary Undo was rejected. Existing removal Undo is unaffected.

## D-018 — Defer backup/export/restore to accounts (2026-10-15)

- **Status:** Accepted sequencing change; partially supersedes D-010's export/backup timing.
- **Decision:** Defer backup/export and restore to the later account implementation, alongside optional hosted storage and PC-web/Android sync. Do not make backup/export/restore the next local-development slice. Core local/offline use remains available without an account.
- **Boundary:** No account, hosting provider, sync protocol or recovery architecture is approved for implementation. Accounts and sync remain outside the present V1 work; account-phase recovery design is still required.
- **2026-10-18 test-data confirmation:** The user explicitly states that **all current Noeting data are disposable test data** and their loss is **not a problem in this development phase**. Accept the present loss exposure for testing, rather than making offline backup/export/restore the next work item. D-018's deferral remains unchanged; this is not a claim that SQLite is encrypted, export/restore exists, or valuable/production data may safely rely on a single local copy. Revisit before the data becomes important or the deployment scope changes. P-008 remains an unaccepted alternative, not implementation authorization.

## D-019 — Approve linked Tasks and the local development course (2026-10-15)

- **Status:** Accepted; user instructed “proceed” after reviewing the relationship and sequence.
- **Decision:** Adopt the P-007 Note-to-Task relationship below and resolve O-008 for this slice. Implement D-017 Reopen, Note-derived Tasks, distinct Reflection/Creation retrieval with source navigation, optional local reminders and focused phone usability checks. Backup/export/restore remains deferred under D-018.
- **Implementation choices:** Schema v4 adds separate Task-source links and reminder intent without rewriting old records. Each Task has one source; a Note may have multiple Tasks. Reminders are explicitly chosen one-shot local times stored as UTC instants; timezone changes retain that moment. Completion/removal cancels future reminders; Reopen/Undo removal never silently reschedules them. No exact-alarm permission is requested; Android may delay inexact alarms. Native OS scheduling is reconciled at startup, foreground and changes; errors remain retryable.
- **Consequences:** Existing offline/no-account workflows remain. Browser validation never claims native notification scheduling. Physical delivery, reboot and large-system-text acceptance require actual device evidence. No account/sync/AI implementation is authorized by this course.

## D-020 — Scheduled pins, unlimited pinning and compact entry navigation (2026-10-15)

- **Status:** Accepted; user reviewed the proposal and instructed “proceed.” Implemented in 0.6.0; actual validation lives in `06_CURRENT_STATE.md`.
- **Decision:** Replace notification reminders with a clock icon for scheduled pinning. Apply due pins while the app is open and catch up when it reopens/resumes; no claim of exact execution while closed. Pins are unlimited and newest pin time sorts first. A due schedule on an already-pinned Task is consumed without moving it. Completion still unpins; Reopen remains unpinned with no Undo or confirmation and now uses a U-turn arrow icon.
- **Cards/navigation:** New task uses a + icon on Notes/Reflections/Creations. Selecting Notes reveals All notes/Reflections/Creations; All and Tasks hide those subfilters. Reflection/Creation original previews open the source directly, replacing Open source. Plain Note cards show only nonzero linked Task/Reflection/Creation counts beside captured-time metadata, with an expand icon opening a separate entry screen. That screen includes entry actions, original/source text when applicable, and grouped linked entries. Back preserves the previous list/search/filter/scroll state, including nested entry navigation. Icons retain accessible labels and 44-point targets.
- **Upgrade/order choices:** Schema v5 removes pin-cap triggers, preserves prior Task/source data, and stores pin timestamps plus a tie-breaking order. Old pins use their creation time as a deterministic fallback because historical pin times were never recorded. Outstanding non-consumed 0.5.0 reminders become scheduled pins; elapsed/cancelled reminders are not revived. Completion/removal cancels scheduled pins; removal Undo restores its old pin position but never reschedules a timed pin. Overdue pins retain their scheduled time so they do not jump ahead of a newer manual pin.
- **Notifications:** Retain Expo Notifications only to cancel old 0.5.0 OS schedules on first launch, with retry on failure. The app no longer requests notification permission or schedules notifications. A device must launch the update to run legacy cleanup. Later removal of the migration dependency is separate cleanup work.
- **Supersedes:** Prior three-pin limits (D-010/P-006), notification-reminder behavior in D-019, and the earlier always-visible thinking filters/modal source-detail design. Existing independent links, originals/current edits, no-account/offline behavior and D-018 account-phase backup sequencing remain.

## D-021 — Entry taps, linked-action menus and completion controls (2026-10-15)

- **Status:** Accepted through the user's “proceed,” including the additional completion-checkbox request. Supersedes D-020's expand control and direct New task action.
- **Decision:** Tap a Note/card body to open its entry screen; remove expand. Text remains selectable, and long press on Note text must not navigate. Keep action controls outside the body target. A top-right + on every active Note/Task/Reflection/Creation opens exactly Reflect, Create and New task. Dismissal creates nothing; existing source/draft/save rules remain.
- **Task sources:** New task may use a Task as its source. Each child remains a separate Task with one immutable source-at-creation snapshot; edits, completion, reopening and removal never cascade to parent or children. This extends D-019 rather than introducing subtasks or completion dependencies.
- **Controls:** Draw the clock and left U-turn Reopen arrow with matching strokes. The clock sits at the right edge immediately before the Task pin. The Today-note choice is a bottom-right pin; filled means selected, and pressing it again keeps selection. Keep accessible action labels and 44-point targets.
- **Completion:** Add checkboxes to Library Tasks, the Task entry itself and linked Tasks on entry screens. Checking completes/unpins/cancels scheduled pinning; unchecking reopens pending/unpinned with no schedule restoration, confirmation or Undo. Update all views and persist. Existing removal Undo remains separate.
- **Alternatives:** Retaining expand, separate Reflect/Create buttons, or using + solely for task creation was replaced by the user's approved design. Device selection gestures/system-font visual acceptance still need phone checks.

## D-022 — Reduce Task card actions (2026-10-15)

- **Status:** Accepted direct user instruction; implemented in 0.7.1 source. Refines D-021.
- **Decision:** Today Task rows have no per-task +. Completed Tasks have no + in Review, Library, full entry details or linked-entry groups. Pending Tasks retain + in Library and entry screens; completing/reopening updates its visibility immediately.
- **Source navigation:** Remove redundant From note/From task buttons from Task cards. Tap the Task body, then its original preview on the entry screen to reach the source, including removed sources. Source links/snapshots, completion/Reopen and scheduled pin behavior are unchanged.
- **Reason:** The user requested fewer repeated actions and identified the original preview as the source-navigation path. This changes UI only; schema v6 is unchanged.

## D-023 — Minimal standalone Noeting with a decoupled personal-agent direction (2026-10-15)

- **Status:** Accepted on 2026-10-15; D-024 subsequently narrows the future M1 interface. No AI or agent work is authorized.
- **Decision:** Continue Noeting as an intentionally minimal independent mobile note/thinking/action interface. Use Xiaomi Notes as a simplicity/interaction reference, not a mandatory storage dependency. Avoid recreating Obsidian's broader knowledge-workspace features. Future differentiated functionality should center on separate, replaceable and permission-controlled agent services rather than editor feature parity.
- **Why:** The user prefers Xiaomi Notes' focused interface and dislikes Obsidian's unnecessary complexity. Existing Noeting code covers the local capture, retrieval, task and linked-thinking foundation.
- **Architectural clarification to D-003:** Owning agent data access, reasoning, permissions and tools does **not** inherently require building a proprietary note UI; keeping Noeting standalone is an explicit UX preference whose usefulness still requires validation.
- **Consequences:** Explore scoped retrieval, sourced reflection and explainable priorities as **future** research; preserve exact user words and explicit approval before changing tasks or acting. Treat Xiaomi sharing/import as an optional unverified adapter, not an assumed full read/write API or sync mechanism. Keep UI scope small.
- **Prior decisions preserved:** D-017 already refers to **Reopen**, D-018 explicitly **defers export/backup/restore to the account phase**, and D-019–D-022 cover implemented linked-Task/scheduled-pin/navigation behavior. D-010's no-AI V1 is unchanged. Do not begin agent or account work based solely on this decision.
- **Planning:** `04_ROADMAP.md` owns proposed research order; `06_CURRENT_STATE.md` owns the single next action and actual validation evidence.

## D-024 — Minimal Notes/Tasks-only M1 refactor; writing meaning belongs to the user (2026-10-16)

- **Status:** Accepted in documentation-only PR #5; implemented locally in 0.8.0/schema v7 on 2026-10-16. Verification and remaining device acceptance live in `06_CURRENT_STATE.md`. This is a new minimal product baseline, not the original 2026-10-13 M1 build.
- **Product:** Two primary destinations: **Notes** and **Tasks**. Each has its own searchable list and type-specific **+** to add a standalone Note or Task. Both types open their own entry-detail screens.
- **Linking:** Only the entry-detail screen of an existing Note or Task may initiate the creation of a linked Note or Task. Permit Note→Note, Note→Task, Task→Note and Task→Task. Each new entry retains independent content, identity and task completion. Keep source links and original words; do not silently convert Notes into Tasks or cascade parent completion/deletion to children.
- **Meaning:** **Reflection and Creation are philosophical outcomes, not app classifications.** Notes can represent reflections, creations, ideas, observations or anything the user decides. Remove Reflection/Creation buttons, filters, labels, prompts and separately modeled product workflows. Preserve historical type metadata and source relationships without presenting legacy entries as special categories.
- **Scope to remove from future M1 UI:** Today, Review, Today-note selection, daily summary/count dashboard, manual and scheduled task pin controls, Reflection/Create actions, extra Capture destinations, separate Settings navigation, deadlines/priorities, agent/AI and advanced organization. Preserve basic Task Complete/Reopen, entry read/edit/remove, search and intentional linking; follow system theme by default.
- **Data and historical boundaries:** No destructive reset of existing v6 records, migrations, original text, legacy Reflection/Creation content, links or Task history. Scheduling/notification effects must not continue invisibly once their controls are removed; legacy OS notification cleanup may be retained until safely retired. The prior 0.7.1/schema v6 implementation remains historical evidence.
- **Supersession:** Narrows earlier *forward-looking UI scope* from D-010, D-013–D-016 and D-020–D-023; it does not falsify earlier implementation records or undo proven provenance/retry guarantees. Retains D-011 stack, D-010 **no AI in V1**, D-018 **account-phase backup/export/restore deferral**, and D-023 standalone/agent separation.
- **Reason:** Noeting should support capturing, searching, connecting and acting, not force the user to say whether a note counts as Reflection or Creation.
- **Document owners:** [02_PRODUCT.md](02_PRODUCT.md) defines UI behavior; [03_ARCHITECTURE.md](03_ARCHITECTURE.md) defines migration constraints; [04_ROADMAP.md](04_ROADMAP.md) defines the Codex sequence; [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md) defines tests; [06_CURRENT_STATE.md](06_CURRENT_STATE.md) keeps implementation status and the sole next action.

## D-025 — Focused Notes, Note-only links and one-level Task/Subtask sheets (2026-10-16)

- **Status:** Accepted by the user's instruction to read and proceed with `CODEX_PR6_XIAOMI_NOTES_TASKS_REDESIGN.md`. Implement on the existing draft PR #6 branch, not main or a replacement PR. Current implementation/verification is maintained in `06_CURRENT_STATE.md`.
- **Decision:** Notes use full-screen writing-first detail/editing; Tasks and their composers use compact expandable bottom sheets. Only Note detail may initiate Note→Note or Note→Task creation. Task UI offers read-only source provenance and one-level Subtasks, never generic linking or relinking.
- **Hierarchy:** Task→Subtask is ownership through `parent_task_id`, separate from source Note links. Parent/child completion, edits and soft-removal are independent. Surviving children remain discoverable if the parent is removed and regroup on Undo. No sub-subtasks or implicit conversion of legacy links.
- **Preservation:** Additive v8; preserve v6/v7 words, edits, timestamps, completion, source pointers/snapshots and legacy Task-origin links. Keep old tasks as roots. Enforce new-write restrictions in repository logic, retain safe retry semantics, and keep schedule retirement/notification cleanup intact.
- **Draft safety and scope:** Explicit Save/Cancel, locally retained drafts through safe dismissal/restart; accessible Back/keyboard behavior. Exactly Notes/Tasks, system theme, no AI/account/sync/Xiaomi integration or expanded organization. D-018 export/restore deferral remains.
- **Supersession:** Supersedes D-024's all-four-combination linking and shared full-screen Task detail, not its historical evidence, minimal scope or data-preservation guarantees. Product behavior: `02_PRODUCT.md`; architecture: `03_ARCHITECTURE.md`; acceptance: `07_V1_WORKFLOW_DRAFT.md`.

## D-026 — Inline Xiaomi-inspired organization and synchronized hierarchy (2026-10-16)

**Accepted direction:** The user supplied `CODEX_PR6_XIAOMI_UIUX_REFINEMENT.md` and instructed “read the file and proceed.” The attachment specifies implementation requirements; it is not test evidence. This decision supersedes D-025's explicit existing-entry edit/Resume UI, always-visible connections, fixed sheet sizing and independent parent/child completion. D-025's provenance/data preservation and one-level boundaries continue.

- Adopt inline existing-entry editing with debounce/lifecycle flushing, contextual durable draft migration/recovery, Unsaved/Retry, anchored dimmed menus, contextual Connections, compact Task sheets and circular FAB. New captures remain empty-safe and use stable idempotency identities.
- Add Note-only folders, deterministic persistent Note pins, long-press multiselect, atomic bulk pin/unpin/move/soft-remove/restore and secondary Recently deleted. Folder removal unfiles Notes; Note pins never reuse Task metadata.
- Adopt Enter-driven single-line Task/child creation, grouped/indented/collapsible children and Completed groups with parent-aware search/orphan fallback.
- Synchronize completion transactionally over active children: parent toggles propagate; child toggles/add/remove/restore reconcile parent, with zero-child manual state and removed-parent reconciliation only on restore. Preserve unrelated historical completion timestamps and legacy cleanup.
- Additive schema v9 preserves old data/links; Note-linked Tasks stay roots. No cascade deletion, source relinking, Task-origin generic writes, scheduling, extra tabs, AI/accounts/sync or Xiaomi integration. Keep same draft PR #6; use a fresh versioned test APK and document native acceptance as blocking if unavailable.

**Finalization addendum (2026-10-16):** The user subsequently instructed “Check and finalize the draft PR #6.” Finalize the existing PR as ready for review after checking the latest fixes and publishing a matching test APK. This supersedes the earlier draft-status instruction for review readiness only; native/device acceptance remains a gate before merge/release. No merge instruction, phone test approval or native pass is inferred.

Product, design and acceptance details: `02_PRODUCT.md`, `03_ARCHITECTURE.md`, `07_V1_WORKFLOW_DRAFT.md`. Verification and sole next action: `06_CURRENT_STATE.md`. Historical decisions remain unchanged.

## D-027 — Dedicated Folders screen and retained quick bar (2026-10-17)

**Accepted:** The user approved the screenshot-based Folders screen, clarified that long-press enters multi-folder selection with Pin/Delete/Edit, and explicitly retained the main Notes quick bar: All first, user folders next, Uncategorized last. “Proceed all above” and “resume” authorize implementation and the previously requested PR/APK delivery.

- Folder icon beside Notes’ More opens a full screen with Back, Folders title, rounded rows, active-note counts, current-folder checkmark, top-right trash entry to selection, and New folder card.
- Tap selects scope and returns to Notes. Long-press selects the held custom folder; subsequent taps toggle additional folders. Pin/Unpin applies to all selected folders, Delete confirms and preserves Notes in Uncategorized, and Edit renames exactly one selection. System buckets are protected; Back exits selection before leaving the screen.
- Keep the quick bar as All → user folders (pinned first) → Uncategorized. Remove creation/management controls from that bar. Use Uncategorized as the display name while preserving the existing internal scope key.
- Add persistent folder pins independently of Note pins via additive schema v10; bulk actions must roll back together. Preserve existing data, source boundaries and D-026 completion/draft behavior. Update existing ready-for-review PR #6 and publish a matching versioned test APK. Native acceptance and explicit merge authorization remain required.

Behavior and design belong to `02_PRODUCT.md` and `03_ARCHITECTURE.md`; acceptance to `07_V1_WORKFLOW_DRAFT.md`; actual verification and next action to `06_CURRENT_STATE.md`.

**Post-merge factual note (2026-10-17; not a new scope decision):** [PR #6](https://github.com/jrkovacic12-arch/Noeting/pull/6) merged into `main` at commit `519c16cf75c5fa9d43a8f96244ca1ae7ef30d5c2`. D-026/D-027 called for native acceptance before merge, but the recorded 0.10.2 evidence still shows physical-device acceptance pending; no explicit waiver or device approval is documented. Source integration is not native validation, security acceptance or release authorization. `06_CURRENT_STATE.md` owns the sole current next action.

## D-028 — Manual safe two-way Android/PC sync (2026-10-19)

**Accepted scope:** The user uploaded “Implement Safe Two-Way Sync for Noeting” and instructed “proceed as instructions,” then resumed the implementation. This explicitly prioritizes S1–S3 on existing draft PR #13 over the earlier S0-only/no-sync direction. Preserve its nine original commits and implement additional reviewable stages, with data integrity ahead of breadth.

Authorize one-phone/one-PC, opt-in, Android-initiated bidirectional committed-content exchange, additive version/journal/tombstone metadata, durable localhost PC SQLite, shared-domain PC editing and explicit conflict choices. Preserve two Android tabs and every existing capture/provenance/draft/Task/folder/removal invariant. No unfinished destructive replay may be enabled outside an explicit development gate. Keep disposable tests only pending native/durability/security acceptance.

This authorizes synchronization, **not** accounts, guaranteed backups/disaster recovery, general restore/import, encryption-at-rest, production security acceptance, scheduled/background sync, AI/Ollama or an unrelated redesign. D-018 retains those separate deferrals/open decisions. HTTPS is transport protection and is not E2EE. Temporary memory-only client secrets avoid silently choosing persistent credential storage. Architecture/setup: `03_ARCHITECTURE.md`; acceptance: `07_V1_WORKFLOW_DRAFT.md`; verified status: `06_CURRENT_STATE.md`.

## Proposal register — accepted items reference decision records

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
- **Device/configuration choices:** The user confirmed Android as the first physical validation target on 2026-10-13. Resolved SDK/package versions and the protective Android `allowBackup: false` default are recorded in `03_ARCHITECTURE.md`; the native test build is statically verified; actual validation outcomes and subsequent simulated-phone instruction are recorded in `06_CURRENT_STATE.md`.
- **Evidence still needed:** The physical-device M1 gate in [04_ROADMAP.md](04_ROADMAP.md); actual automated evidence is in `06_CURRENT_STATE.md`. Deferment, dates/reminders, edit/delete semantics, encryption/iOS backup policy, and cross-loop additions remain separate unresolved work.

### P-007 — Note-derived Task relationship (2026-10-15; accepted as D-019)

- **Interaction:** A saved Note offers **New task**. Open a form with the source read-only and a separate editable task field, initially filled with the Note's current words. Only Save creates a pending, unpinned Task in Today; dismissal creates nothing. Stay on the current screen after saving and preserve Today-note selection.
- **Relationship:** One Note may source multiple independent Tasks. Each Task keeps its own Task-kind Entry and one explicit source link, separate from reflection/creation links. Do not convert or overwrite the source Note. Show **From note** on the Task and related Tasks on the Note; navigation must reveal the relationship from either side.
- **Independence:** Editing or completing/reopening a Task never edits the Note; editing the Note never rewrites existing Tasks. Preserve the Note's immutable first capture and the exact source words at task creation so later edits remain understandable.
- **Removal:** Removing a Note never removes its Tasks; removing a Task never removes its Note. A removed Note remains inspectable as source material with a removed label. No automatic restoration or cascading changes.
- **Reliability:** Atomic Task/Entry/link creation and stable-request retry deduplication; repeated Save taps produce one Task, while separate deliberate creations may produce multiple. Additive migration must preserve old captures, tasks and thinking links; failed writes/migrations roll back. Test restart durability, edits/removal independence and source navigation.
- **Status:** Accepted by the user’s “proceed”; D-019 records approval. Implemented with schema v4; actual verification is recorded in `06_CURRENT_STATE.md`.

### P-008 — Minimal offline recovery independent of accounts (2026-10-18)

- **Status:** Proposed for a future decision; not accepted, implemented or tested. D-018 remains in force. After the 2026-10-18 test-data-only clarification, **not a current priority**; revisit only when real data durability/portability becomes relevant.
- **Candidate:** A deliberate local file export and validated offline restore, without accounts, hosted storage, sync or automatic scheduling. Its technical scope and data-safety requirements are owned by `03_ARCHITECTURE.md` under “Data-loss exposure and future offline recovery.”
- **Reason to revisit:** A lost/damaged device, uninstall, cleared app storage or corruption can make the only local copy unrecoverable. Soft deletion/Undo and retained drafts share the same failure domain.
- **Decision/evidence needed:** A new accepted decision must change D-018's sequencing, define included records/drafts, restoration/conflict policy and file protection, then require round-trip, malformed-file, referential-integrity and interrupted-restore tests on disposable data. This proposal grants no implementation permission.

## Open decisions

| ID | Question | Owner/status |
| --- | --- | --- |
| O-001 | Are the detailed V1 acceptance criteria and lifecycle semantics complete? High-level feature scope approved; **no AI in V1**. | Partly resolved; details open |
| O-002 | Mobile stack/SDK versions recorded in `03_ARCHITECTURE.md`; Android is the user-confirmed first physical target (P-006); exact test device / native compatibility? | Stack/versions resolved; device validation pending |
| O-003 | What category/type taxonomy is understandable in use? | Resolved for D-024 M1: Notes and Tasks only; historical reflection/creation labels preserved as storage metadata, not displayed. |
| O-004 | What is the precise data-sharing and on-device/cloud AI policy? | Open |
| O-005 | How are reminders, importance, urgency, and user-confirmed priorities represented? | Not part of D-024 M1; future reintroduction requires a new decision. |
| O-006 | What is the local security threat model and encryption approach? | Open |
| O-007 | When, if ever, does Noeting need external integrations, desktop, or sync? | Open |
| O-008 | How should a user-accepted Task derived from an existing Note preserve provenance without rewriting the Note, given the M1 trigger requires a Task-kind Entry? Decide relationship, migration, retry, and deletion rules before implementing that flow. | Resolved for the approved relationship under D-019/P-007; schema v4 implemented, validation recorded in current state |

**Recording future decisions:** Use a new `D-###` entry with date, status, choice, alternatives considered, rationale, and consequences. If a decision changes, mark the older entry `Superseded` rather than silently rewriting history.
