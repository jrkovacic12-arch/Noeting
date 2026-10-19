# Noeting — V1 Workflow Specification (Draft)


## V2 synchronization acceptance — D-028 (2026-10-19)

Automated coverage uses real SQLite, the actual localhost HTTP server, a PC browser, and the Expo SQLite web app. The browser phone workflow uses a **test HTTPS request adapter** forwarding to localhost; it proves application integration, not certificate trust, a physical Android receiver, Tailscale or a real phone network. Actual commands/results belong only to `06_CURRENT_STATE.md`.

Real-device checklist (all **NOT RUN for v11** until explicitly recorded):

1. Install/upgrade a matching development APK on Android with disposable populated v10 records. Inventory original/current words, links/frozen provenance, capture IDs, pins, removed records and Task states. Confirm v11 upgrade and offline capture/restart.
2. Configure a private trusted HTTPS forwarder to the localhost v2 server. Pair/initialize only an empty PC. Verify the phone rejects HTTP/untrusted TLS/wrong secrets, does not import v1 JSON, and refuses another library/PC identity.
3. Create/edit a Note and Task independently on both devices while disconnected. Phone Sync now must transfer both directions exactly once; originals/IDs remain. Repeat without changes. Verify PC-to-phone edits wait for Sync now.
4. Exercise root/child complete/reopen, new children, removed-parent fallback, folder creation/assignment/pins and PC folder deletion/unfiling, links to removed sources, soft removal and restoration with the same metadata on both sides.
5. Edit the same Note offline on both; also edit versus remove. Inspect both values/revisions, restart both, then resolve each choice and a valid standalone Note keep-both. Verify structural conflicts require valid choices and unrelated changes continue.
6. Leave an inline edit failed/unsaved (including a child), retain new creation drafts, and invoke sync from Notes. Existing unsaved edits must defer incoming replay and retain words; committed retry then sync must converge. Check keyboard, Back and background transitions during sync on the actual device.
7. Interrupt Wi-Fi/HTTPS, force-stop/reboot phone/server around bootstrap, upload, pull and acknowledgement. Retry with no lost committed text, duplicate identities/side effects or skipped remote operations. Use a representative large library and record native memory/latency.
8. Disconnect on Android and revoke on PC. Verify the revoked phone cannot exchange, offline local data still works, explicit reauthorization restores the same library, and restarting with a rotated secret invalidates old authentication. Confirm no token persists in KV/SQLite/logs.

Do not call sync a production backup or encryption system after these checks. Valuable-data durability, account/restore policy and production security remain separate acceptance decisions under D-018. Historical N1–N9 results below validate the earlier release, not this new synchronization runtime.
> Created: 2026-10-11. Current acceptance refreshed: 2026-10-18 (0.10.3/code 20/schema v10; PR #8 merged). D-027/D-026 define active Notes/Tasks behavior. Actual outcomes and device/release gates belong only to `06_CURRENT_STATE.md`.
> Historical boundary: D-025 and earlier Capture → Today examples are superseded research/validation history, not current UI requirements. Execution results belong to `06_CURRENT_STATE.md`.

## Android physical-device acceptance protocol — 0.10.3/code 20

**Outcome recorded 2026-10-18:** The user explicitly confirms **all cases N1–N9 were fully completed successfully** on the 0.10.3 test APK. Treat as **USER-REPORTED PASS for every case**. The device model, Android/IME, installation method, per-substep observations and independently inspectable evidence were not supplied and must not be inferred. The protocol below remains the expected-behavior reference for future regression tests; it does not reopen completed user-reported acceptance. Current evidence ownership: `06_CURRENT_STATE.md`.

This is a procedure, not evidence of execution by the agent. Use the existing matching APK identity/download in `06_CURRENT_STATE.md`; do not build/publish another APK or treat a source merge as device sign-off. Read current behavior in `02_PRODUCT.md`. Record actual results only in `06_CURRENT_STATE.md`.

**Before testing:** Record phone/model, Android version, keyboard/IME, installed and candidate version/code/package/signer, APK checksum/source identity, available storage, connectivity/battery restrictions and test date. Use innocuous canary text rather than private note text in logs/screenshots. Inventory representative existing original/current words, counts, folders/pins, completed/pending parents/children, Note links, frozen/removed sources and soft-deleted Notes. Prefer a populated compatible test installation; do not clear data or uninstall to make an upgrade succeed. Stop on signer/package mismatch. There is no implemented backup/export/restore safety net (D-018); do not intentionally corrupt the only library.

| Case | Actions and expected observation |
| --- | --- |
| N1 — Populated in-place upgrade | Install over the existing compatible app without uninstall/clear-storage. Record previous code/schema and installer result. Verify the inventory and absence of a reset. Reinstalling code 20/schema v10 is not an older-schema migration pass; record migration as not exercised if no older fixture is available. Never downgrade/erase the only populated phone to manufacture coverage. |
| N2 — Existing records and provenance | Search/open Notes and Tasks, compare exact Unicode/whitespace and original vs edited words, folders/pins and list scope. Traverse Note-linked Notes/Tasks and frozen source previews, including removed sources; verify independent records remain. Exercise folder rename/pin/delete, preserved Notes, soft removal and Undo with disposable canaries. |
| N3 — Keyboard, IME, Enter and Back | Check existing-entry no-autofocus and new-entry autofocus, multiline Note newline, Task/child Enter and next-child focus, blank Enter, composition/candidate selection and repeated Enter without duplicates. Check keyboard-first Back, then menu/sheet/entry/selection ordering and read-only Task-source Notes. Record keyboard/IME and each outcome. |
| N4 — Drafts and interrupted saves | For standalone Note/Task, linked and child contexts, type distinct canaries, dismiss via outside tap/swipe/Back, wait for actual dismissal, reopen and compare exact words. Repeat after restart and verify context isolation/stable retry without duplicate captures. Test Cancel then reopen (empty), inline-edit autosave and reversion. Interrupt a save where safely reproducible: after acknowledged Save/dismissal require committed text; before acknowledgement record whether none or one complete record/recovery draft survives, with exact timing. Never call partial/lost acknowledged content a pass. |
| N5 — Long-press versus scrolling | Hold selects without opening/accidental actions; drag/scroll cancels selection. Verify selection overlays, Back clears selection, mixed folder/Note bulk actions, disabled actions and no unintended pin/delete. Repeat with long lists and larger system text. |
| N6 — Parent/child completion | For one/two/three children, toggle root and child, reopen/add a pending child, remove/Undo the last active child, and remove/restore the parent. Compare committed group status, zero-child manual state and orphan fallback with `02_PRODUCT.md`. Generic source links remain independent and words/provenance are unchanged. |
| N7 — Offline, force-stop and reboot | Enable airplane mode, make acknowledged saves and safely dismissed drafts, then force-stop through OS settings (swiping recents is a different action), reopen and compare inventory. Repeat after reboot while offline. Separately record backgrounding or force-stop during typing/before save/dismissal acknowledgement; the 50 ms coalescing window and OS lifecycle scheduling are not a guaranteed abrupt-termination durability bound. Report any lost words/timing; do not extrapolate from graceful browser shutdown. |
| N8 — Legacy notification cleanup | On a compatible historical installation with known old Noeting notification requests, upgrade/launch and verify cancellation and retry on foreground if a supported failure is reproducible. Confirm no new scheduling/permission prompts or hidden scheduled-pin effects. If no legacy fixture/request exists, mark this case NOT RUN or not applicable with the reason; absence of a current alert alone does not prove upgrade cleanup. |
| N9 — Write failure and Retry | Use only a safe supported fault-injection setup on disposable data to test database/KV failures, visible retained words, blocked unsafe dismissal/Cancel, successful Retry and no duplicates. Do not fill/corrupt/clear a real phone's only storage to trigger failures. If native fault injection is unavailable, record NOT RUN; browser/SQLite injection results stay separate. |

**Evidence format:** For every N1–N9 subcase record PASS / FAIL / NOT RUN / BLOCKED / NOT APPLICABLE, expected vs observed result, device/build identity, exact interruption/acknowledgement point, non-sensitive screenshot/log reference and limitation. A case with unexecuted substeps is partial, not an all-pass. Use the native evidence register in `06_CURRENT_STATE.md`; browser and static APK results never fill native rows.

Keep emulator troubleshooting bounded: one focused retry for a tooling/timing failure, then record the blocker and continue unaffected checks. Investigate demonstrated app/data defects; do not erase state or add features to obtain a pass. Device testing does not itself authorize a merge, release or new APK publication.

## Current D-027 folder acceptance — 0.10.3

- Verify quick bar ordering All → user folders (pinned first) → Uncategorized, and identical ordering on the Folders screen; counts exclude deleted Notes and ignore active search.
- Verify tap chooses scope, long-press selects without navigating, additional taps toggle selection, multi-selection disables Edit, and system buckets cannot be selected. Verify the trash icon enters selection with zero selected; Back exits mode before leaving.
- Verify folder pin/unpin, rename retaining pin order, collision/empty-name errors, restart persistence and preserved scoped search. Confirm/cancel bulk deletion, preserve active/removed Notes and their pins, and recover a creation draft whose folder was removed.
- Interrupt populated v9→v10 migration, prove rollback and retry. Inject halfway pin/delete failures and prove all selected folders/Note references remain unchanged; retry successfully. Preserve existing D-026 boundaries and accepted native-device gate below.

## Continuing D-026 acceptance — active behavior inherited from 0.10.1

- Preserve populated v6/v7/v8 originals, edits, links, legacy pins, soft removals and timestamps; interrupt v9 migration, prove rollback, retry. Keep new generic links Note-origin only.
- Create/rename/delete folders with case-insensitive collision handling, scoped search, persisted list context, deterministic pins across restart/offline, mixed bulk pin/unpin/move and atomic failure. Bulk soft removal/Undo and Recently deleted recover organization.
- Capture/link Notes in a selected/source folder atomically; test rollback and committed retry behavior. Delete a retained draft’s folder, restart, and recover/save its exact words into Unfiled. Draft-storage failure blocks capture, Cancel retains words until durable deletion, failed child close stays open, and reverted/matching recovered edits clear Unsaved.
- Hold selects without opening, scroll cancels, Back/tab/folder/search exits selection, selected state and 44 dp actions remain accessible.
- Existing text edits directly with no Edit/Resume; exact-context recovery survives repository/storage failure and restart; originals/frozen provenance remain readable. Overlay menus preserve content bounds, dim immediately and isolate accessibility. Connections is contextual only.
- New Task autofocus/Enter moves to Next step; blank Enter creates nothing, composition does not submit prematurely, repeated Enter deduplicates, pending child blur/failure/restart preserves text and request. Existing Tasks do not autofocus.
- Inline grouped/indented child lists, count/collapse, Completed grouping, parent/child search and orphan access remain coherent from committed snapshots. For one/two/three children verify every D-026 completion transition plus halfway rollback and retry.
- Compact/expanded sheets, circular FAB, system themes, narrow/large text, source read-only navigation, offline content and large fixture tab switching. Native keyboard/Back/IME, touch-scroll cancellation and in-place upgrade still require separate device evidence **after merge**, before any release-readiness claim. The original premerge gate and review instruction remain historical.

Actual commands, counts, evidence and unresolved limits live only in `06_CURRENT_STATE.md`. Older acceptance sections below are historical.

## Historical D-025 acceptance — 0.9.0 redesign

1. Full-screen Note capture/read/edit, explicit Cancel/Save, Copy, original capture, Remove/Undo and exact words/line breaks.
2. Note→Note and Note→Task only from Note detail; source snapshots remain frozen after source edit/removal. Note-linked Tasks remain roots, appear in Linked tasks, and open in sheets with read-only Note navigation. Cancel creates nothing.
3. Task-origin generic writes are rejected at every new-write repository boundary; old Task-origin links remain readable and do not become hierarchy.
4. Standalone Task sheet, direct list checkboxes, independent one-level Subtask capture/edit/completion, progress and restart persistence.
5. Search child text, identify the parent and reveal the matching child in the parent sheet. No ordinary-list duplication of active-parent children.
6. Parent/child removal and Undo are independent; removed-parent fallback preserves ownership and access. Undo regroups surviving children.
7. Populated v6/v7-to-v8 upgrades and repeat opens preserve every original column, source and completion state. Injected migration/write failures roll back; retries retain identity and do not duplicate.
8. Outside tap, swipe and Back retain unsaved drafts with stable requests; Resume after restart; explicit Cancel discards. Visible failure recovery retains words. No background link controls exposed while a modal is open.
9. System theme, 320px/large text, sheet expansion, scrolling, 44px controls and labels. Verify Android keyboard/Back/offline reboot/in-place upgrade and notification cleanup on a real device separately.
10. Exactly two primary tabs, with no scheduling/classifications/AI/sync/Xiaomi integration. Earlier 0.8.0 APK evidence does not validate this redesign. Actual runs/results belong to `06_CURRENT_STATE.md`.

## Historical D-024 acceptance — 0.8.0 automated coverage


- **A1:** Open Notes: only Notes/Tasks primary navigation, searchable Note list and + creating a standalone Note. It appears once, is editable in its entry details, and survives offline restart. Saving does not classify it as Reflection/Creation, select a Today Note or open another flow.
- **A2:** Open Tasks: searchable Task list and + creating a pending Task; Complete/Reopen updates the same Task without duplication, source edits or confirmation. Preserve state through restart.
- **A3:** Open a Note's detail: Link note and Link task create independent children; cancel creates none. Only entry details expose these linked-create actions. Child cards open full detail and navigate back to parent.
- **A4:** Open a Task's detail: Link note and Link task also work; completion/reopening of parent never cascades to linked child. Linked entries preserve provenance and source-at-creation words after separate edits.
- **A5:** Upgrade an existing v6 database containing directly captured Notes/Tasks, Reflection/Creation records, Note-derived Tasks, Task-to-Task links, removed sources and completed Tasks. Every original/current text and relationship survives, and historical Reflection/Creation appear as ordinary Notes with no special filter/action. Verify failure rollback and retry.
- **A6:** Navigate lists/detail, search, edit/remove, return with Android Back, use large text/keyboard, and restart offline. No Today, Review, summary card, pin/schedule controls, extra Settings or hidden scheduled-pin activation appears. Old OS notifications are cancelled through supported upgrade cleanup if applicable.
- **A7:** No data loss or silent conversions when linking, completing, removing or retrying a failed save. No AI/account/sync/backend requirement. Record real device and automated evidence separately; previous tests remain historical and must be updated, not called passed for the refactor.

**Evidence:** TypeScript and 29 real-SQLite tests pass, including populated v6 preservation, migration rollback, generic-link failure/retry, all four link combinations and file reopen. Five Playwright workflows against the real Expo SQLite web build pass: searchable/offline capture and completion/restart; all four detail-only links and removed sources; populated v6 UI upgrade; failed-save text retention/retry and edit/remove/Undo; system theme and 320px/large-text layout. These cover browser portions of A1–A7, not native Android Back, keyboard, OS notification cleanup, phone in-place upgrade or native offline reboot. See `06_CURRENT_STATE.md` for delivery evidence.

**Scope status:** D-025 above supersedes these 0.8.0 criteria; the following is historical evidence. The remaining sections below preserve the pre-D-024 historical prototype and 0.7.1 testing record.

## Historical pre-D-024 prototype research — goal and boundary

Help a person preserve thoughts and manage accepted commitments with little organizational overhead. The first testable loop is **Capture → Clarify → Today → Reminder (when explicitly set) → Review → Stop**. Preserve an intentional path through reflection, experiments, and creation without requiring a separate Create screen. **Save closes Capture immediately** and returns the user to the prior activity; clarification or AI suggestions, if used, happen later through a deliberate action, not as a save-time prompt. No default AI conversation, feeds, or silently created commitments.

## Candidate screens (low-fidelity sketches)

```text
CAPTURE                      TODAY                       REVIEW
[Note | Task] [Text area]    [Capture (header)]          Completed: 1
[Save → close]               Daily summary               Deferred: 1
                             Tasks [+ Add task]
LIBRARY                      [Pin / Unpin (max 3)]
[Search] [Type filter]       Pinned tasks appear first
[Entry → Reflect / Create]   Think, then return
                             [Enough for today → exit]
```

## Example scenarios and expected results

### S1 — A quick thought remains a thought
- **Input:** "Maybe constant feeds interrupt independent thinking."
- **Action:** User enters the text and selects Save.
- **Expected in revised wireframe:** Original text preserved locally as a **Note** entry by default. No task, reminder, AI chat, or forced next action. **After Save, Capture closes immediately**, returning to the previous activity without another prompt.

### S2 — A plan with a task requires acceptance
- **Input:** "Prepare three slides for the team meeting; maybe write a post about the process."
- **Action:** Save stores the plan as a **Note** and closes Capture. Later, a deliberate **New task** action in Library may show the unchanged text and an optional **suggestion**, "Create task: Prepare three slides." User can Accept, Edit, or Dismiss. Alternatively, a user can choose **Task** directly in Capture to save an explicitly intended task. The possible post remains an idea.
- **Expected:** Accepting a suggested task creates one Task linked to the unchanged Note; dismissing creates none. Separately, manually choosing Task in Capture and saving also explicitly creates a Task. No meeting date or due date is invented. User may independently set date, priority, reminder, or defer.

### S3 — Daily brief and priorities are finite
- **Input:** Two accepted pending tasks, one known deadline, five thoughts, and one completed task.
- **Action:** Today shows one compact summary and one Tasks list, with each task displayed once. Users pin up to three tasks directly in the list; pinned tasks move above others. Known due dates remain visible where set. Today separately offers optional deliberate reflection/creation from existing notes. If AI assistance is enabled later, it may propose up to three priorities with reasons, requiring user confirmation.
- **Expected:** No duplicated priority/task rows; pinned tasks retain their editable underlying task state. Facts, future AI proposals, and accepted priorities remain distinct. The thinking item is optional **without a redundant Skip button**; "Enough for today" ends the flow.

### S4 — Reminder is user-scheduled, not AI-timed
- **Input:** An accepted task, "Prepare three slides," with user-selected reminder of 2026-10-15 09:00 in the device's local timezone.
- **Action:** User saves the reminder after viewing time and notification permission state.
- **Expected:** App persists an explicit reminder record and delegates scheduling to the platform; shows scheduled/permission-denied/error status. Notification fires in testing only if platform permissions and restrictions allow. AI does not control time or silently schedule reminders.

### S5 — Reflection can lead to creation without a dedicated screen
- **Input:** User opens an earlier Thought.
- **Action:** Selects **Reflect** or **Create**.
- **Expected:** New editable linked Entry; original thought remains unchanged. This is a proposed lightweight affordance, not a commitment to a standalone Create workspace.

### S6 — Thinking can inform action without making every idea a task (proposed test)
- **Input:** An existing Note: "Maybe a quiet walk helps me develop original ideas."
- **Action:** Later, the user deliberately records a linked reflection or experiment ("Try a 20-minute walk without headphones"). If they want a scheduled commitment, they explicitly choose **New task** and accept or edit that task; otherwise it remains a non-committal idea.
- **Expected if implemented:** The original Note remains unchanged; no task, deadline, or reminder is created merely by reflecting or recording an experiment. Any accepted task is linked rather than substituted for the source. Saving the original Note never requires this transition.

### S7 — Action can inform thinking without obstructing completion (proposed test)
- **Input:** The user completes an accepted task: "Prepare three slides for the team meeting."
- **Action:** Marking the task complete ends that action immediately. Separately, in the completed-task detail or deliberate Review, the user may choose **Reflect** and write what they learned; they may also leave without adding anything.
- **Expected if implemented:** Completion remains complete regardless of reflection. An optional new reflection links to the task or its source Entry without rewriting either. No automatic reflection prompt, new task, or ongoing engagement loop is required.

**S6–S7 are illustrative research proposals, not implemented wireframe behavior or approved V1 requirements.**

## Scenario assumptions (proposed, not product requirements)

For category and task definitions, use [02_PRODUCT.md](02_PRODUCT.md) §§3 and 7; for scheduling and AI/privacy enforcement, use [03_ARCHITECTURE.md](03_ARCHITECTURE.md) §§4–6. [05_DECISIONS.md](05_DECISIONS.md) records what remains proposed or open.

These examples assume that a dismissed suggestion leaves no accepted task, confirmed Today priorities remain distinct from known due/overdue tasks, and developing a thought creates a linked entry while preserving the original. Deferment behavior, category semantics, consent UI, and the summary timing are **still test questions**.

## Prototype acceptance tests (full real-device/user validation not yet executed)

- [ ] Saving a **Note** preserves exact original text after app restart, creates no task, and **closes Capture immediately** without a follow-up prompt or AI response.
- [ ] **Capture offers only Note / Task**; Today **+ Add task** preselects Task; directly saving it creates one linked pending Task without fabricated deadline; dismissing a Note-to-task suggestion creates none, accepting creates one.
- [ ] Each pending task appears only once; pinning moves it to the top with a maximum of three pins; Today retains finite optional reflection/experiment/creation without **Skip for today**.
- [ ] Brief reflects only existing records and known deadlines; any AI output is visibly a proposal.
- [ ] A user-selected reminder is persisted and scheduled; permission refusal and scheduling failure are surfaced; actual device delivery is tested.
- [ ] Offline capture, Today, Library search, and Review are functional without AI.
- [ ] Reflection/creation can link to an original entry without changing its original text.
- [ ] No note text is sent externally without explicit, scoped authorization.

### Additional research checks (S6–S7; not V1.2 acceptance criteria)

- [ ] If a thinking → action handoff is explored, a note/experiment can remain non-committal; creating a linked task requires deliberate acceptance, and the original remains unchanged.
- [ ] If an action → thinking handoff is explored, completing a task does not trigger a required prompt; any later linked reflection is deliberate and optional.

## Prior wireframe iterations — 2026-10-12 (historical)

- **Initial prototype:** The standalone [`noeting_capture_today_prototype.html`](noeting_capture_today_prototype.html) began with Capture, Library clarification, Today, Review, linked thinking, and simulated reminder records. Eighteen headless-browser checks passed; priorities initially appeared twice.
- **V1.1:** After the user's approval, Capture became Note/Task only, Today gained **+ Add task**, user-facing text changed to **Tasks**, and the Think Skip button was removed. Thirty-three simulated-browser checks passed. Earlier entry types remained intact.
- **Testing boundary:** Historical checks used a mocked in-document `localStorage` interface, not real browser-file persistence or phone validation. They are superseded by the current V1.2 test script below; no AI or real reminder delivery was built.

## V1.2 consolidated Tasks iteration — 2026-10-12

- **User feedback:** Duplicate Capture controls across screens and repeated priority/task rows made the prototype unnecessarily complex. Changes were approved before implementation; no specific test device or structured test outcome was documented.
- **Implemented:** Removed navigation and Library Capture duplicates; retained the header Capture and Today + Add task. Removed My priorities and three statistics cards/second brief; added one compact summary and one Tasks panel sorted pinned-first, with pin/unpin (maximum three). Hidden no-date placeholders and collapsed the prototype test tools. Capture dialog has one heading and one close control (×).
- **Automated evidence:** **53 simulated Chromium/Playwright checks passed**, including unique task rows, pin-first ordering, pin-limit enforcement and unpinning, Capture/Library deduplication, legacy record compatibility, and prior safety flows; `test_noeting_v12.py` is the single current script. Screenshots: `noeting_v12_desktop.png` and `noeting_v12_mobile.png`.
- **Limitations at this prototype iteration:** Checks run with an in-document storage mock. Actual phone use, full-browser persistence/offline behavior, notifications, and formal usability results remain unverified. D-010 subsequently accepts the high-level V1 scope; detailed production acceptance criteria remain open.

## Prototype action wording update — 2026-10-12

- **User feedback:** After reporting prototype testing, the user explicitly requested four shorter action labels; device and detailed test outcomes were not specified.
- **Implemented:** Library actions **Develop into creation → Create**, **Add reflection → Reflect**, **Choose for Today → Today note**, and **Make task → New task**. The Today thinking card now also uses **Create**; its existing **Reflect** label remains unchanged.
- **Scope:** Wording only. Existing actions, linked-entry behavior, manual task acceptance and data records are unchanged. No new V1 scope or validated usability claims.

## User-reported prototype follow-up — 2026-10-12

- Following the four label changes (**Create**, **Reflect**, **Today note**, **New task**), the user stated: **“Tested, worked as intended.”** This is qualitative self-report of the prototype behavior, not an independently observed session.
- **Unknown:** test device/platform, individual actions executed, S1–S4 checklist results, task persistence after restart, notification delivery, offline operation, and broader user comprehension. Do not retroactively mark pending prototype or native-app acceptance checkboxes as passed.
- **Outcome:** The user agreed to the high-level first working app scope (D-010) and the React Native + Expo + TypeScript + SQLite stack (D-011). The HTML prototype remains the UX/behavior reference for Codex; M1 does not include real reminders or AI.

## Evidence to collect during the prototype test

- Whether participants understand the difference between captured thoughts, proposed tasks, and accepted commitments.
- Whether the single Capture entry point and unified pinned-first Tasks list reduce unnecessary interactions, especially when many tasks are due; whether Today remains finite and supports thinking/creation.
- Whether users understand reminder state and notification permission failures.
- Whether linked reflection/creation feels natural without a separate Create screen.
- Whether S6–S7 add value without increasing steps, imposing productivity pressure, or making the user remain in Noeting; mark those flows **not tested** if the current wireframe does not support them.
- Whether optional AI permission requests are clear and bounded, if AI is included in a test.

The open-decision register is [05_DECISIONS.md](05_DECISIONS.md); the **sole current next action** is in [06_CURRENT_STATE.md](06_CURRENT_STATE.md). This draft records hypothetical behavior, an interactive prototype, and limited automated checks. High-level V1 scope is accepted under D-010; this draft is not a fully approved detailed specification or real-life usability validation. Use the M1 contracts and gate in `02_PRODUCT.md`, `03_ARCHITECTURE.md`, and `04_ROADMAP.md` for the native first slice.

## Proposed M2 workflow checks — not implemented or executed

These are candidate acceptance scenarios for the accepted V1 direction, **not** evidence of native behavior or an expansion of the M1 device gate. The exact Note-to-Task relationship is open under O-008 in `05_DECISIONS.md`.

- [ ] **Library retrieval:** Save a Note containing multiline text and deliberate whitespace; close/restart the app offline and find its exact original content through Library search/filter. Confirm a Note alone creates no Task.
- [ ] **Deliberate Note-to-Task transition (subject to O-008):** Start **New task** from an existing Note, dismiss, and verify no commitment was made. Repeat with explicit acceptance and verify exactly one Task is created, with the original Note unchanged and an inspectable provenance link; retries and restarts do not create duplicates.
- [ ] **Reflect/Create linking:** From a saved Note, independently author a Reflection or Creation. Verify the new entry is separately editable, remains linked after restart, and never overwrites original source text. Verify no mandatory reflection follows task completion.
- [ ] **Edit/delete/recovery boundaries (design pending):** Decide behavior for linked entries and tasks before implementing destructive operations; verify rejected edits, deletion attempts, or interrupted migrations do not silently corrupt surviving source material. Export/restore testing remains a planned M3 gate unless separately reprioritized.
- [ ] **Deterministic Today:** Optional Today note and overview are finite, derive only from existing entries and accepted tasks, and invent no deadlines or new commitments.

## Native Android emulator evidence — 2026-10-13

The user requested a simulated phone for this run. `tests/android_smoke.py` exercised the native release app on Android 9 x86_64 AOSP. Capture, pin cap/completion, offline force-stop/relaunch, Library search/filter, deliberate stop, exact multiline whitespace in SQLite, and full emulator reboot preservation passed. The test used a guarded resume after verifying the same artifact/device and saved fixtures; it was not an uninterrupted initial run. Seven real-storage browser tests separately passed, including whitespace/Unicode retrieval and completed-task status. Actual artifact/device identity and detailed evidence remain in `06_CURRENT_STATE.md`.

The physical-device checklist below remains **pending**. Android 15 failed during emulator system startup; no Android 15 app pass is claimed. Native rapid-save and injected-write-failure checks were not executed. Plain storage, physical keyboard/usability, ARM64 compatibility, notifications and security acceptance remain separate.

## Approved stop-free Today/Review revision — 2026-10-13

D-012 removes explicit stop cards/screens/buttons; users close the app themselves. D-013 implements the prototype's chosen-note thinking and Review with a visible summary card, compact right-edge pin icons and no Library combined reset button. Current native source and HTML reference both follow this direction; earlier stop-related examples/checks above are historical and superseded.

- [x] Save a Note and deliberately select it for Today; retain the choice through restart; Change/dismiss creates no Task.
- [x] Reflect/Create show the original read-only and save separately authored linked entries; preserve exact source text, reject changed retry identity, retain failed-save drafts and create no automatic Task.
- [x] Review displays completed tasks and linked thinking with inspectable source text. The summary card derives open/completed/saved-entry totals from current records without fabricated dates.
- [x] Native v1→v2 in-place upgrade preserves old data, completion and pins; native chosen-note/link records survive force-stop/relaunch and full emulator reboot offline.
- [x] UI/browser checks confirm compact pin placement/state and absence of Finish session, Enough for today and combined Library reset controls. HTML simulated checks also pass.

Actual assertions, artifact identity and venue are maintained only in `06_CURRENT_STATE.md`. Physical-phone acceptance and native injected-write-failure checks remain open.

## Historical M1 native-device smoke checklist — 2026-10-13 (superseded)

Record device model, Android version, ABI, APK/build identity, connection state, and each result in `06_CURRENT_STATE.md`. The user confirmed Android as the initial target; no device run is claimed. The expected standalone test APK is ARM64 (`arm64-v8a`) for Android **7.0+ / API 24**, with its bundle embedded; the artifact and declared architecture/SDK support are statically verified, while installation and native runtime remain **unvalidated**. The current Android build status and build/verification commands are maintained only in `06_CURRENT_STATE.md`.

- [x] Build completed and static APK verifier passed. Artifact: `artifacts/noeting-m1-android-arm64-test.apk`; SHA-256 and signer-certificate digest are recorded in `06_CURRENT_STATE.md`. Phone compatibility remains part of the pending installation check below.
- [ ] Confirm the chosen phone is ARM64 and Android 7.0 or newer; install the verified test APK and record install/launch results. With a USB-connected authorized device, use `adb install -r artifacts/noeting-m1-android-arm64-test.apk`; otherwise transfer the verified file and use the phone's package installer. Do not uninstall existing app data to resolve a signing mismatch: preserve it and investigate. This expected APK uses a development key and placeholder identity/branding, not store-release signing.
- [ ] Launch the installed app without Metro or Expo Go. Confirm it reaches Today; record any crash or startup-storage error before testing. A preview that depends on a development server does not establish standalone cold-start behavior.

- [ ] Capture a multiline Note with leading/trailing whitespace: no Task appears, Capture closes only after save, and the note count increases. Original-text equality is covered by repository tests; inspect the development database if verifying it on-device, since M1 has no Library reader yet.
- [ ] Use **+ Add task**: Task is preselected; save creates one pending row. Rapid Save taps create no duplicate. Close/reopen Capture and verify normal Note/Task entry and keyboard behavior.
- [ ] Create four tasks, pin three, confirm the fourth cannot be pinned; unpin one and pin another. Complete a pinned task: it disappears from pending tasks and frees its pin.
- [ ] Enable airplane mode, force-stop the installed app, and relaunch it: note count, pending task identities/order, completion, and pins persist. Capture another item offline, repeat force-stop/relaunch, and record that it loads without Metro or another server. Also restart the phone and confirm the saved state remains available offline.
- [ ] Confirm there is no Finish session/Enough for today/stop flow. Users close the app themselves. Check errors/failed-save input retention with a controlled development failure harness if available; automated/browser failure checks do not establish physical-device error behavior.

OS reminders, Library retrieval, Review/Reflect/Create, export/restore, and security acceptance are outside this M1 smoke checklist and remain later V1 work.

## 2026-10-14 — Approved implementation update (D-014)

Direct Note saves choose Today atomically. Editing updates current words without changing first captures; removal hides items across tabs with Undo while preserving dependent thinking/source text. Today Task/note toolboxes support Copy/Edit/Remove; Review/Library use icon actions. Forms close with X, branding is centered, and bottom icon navigation follows scroll direction. Automated schema v1/v2 upgrade, failure rollback, cross-tab, clipboard, long-press and scroll-bar checks passed; this does not mark the physical acceptance scenarios above as passed. Evidence and the exact next action remain in `06_CURRENT_STATE.md`.

### Approved interaction refinement — 2026-10-14 (D-015)

The user reviewed the combined proposal, corrected exit to Today only and removal feedback to a small “Undo” control, then instructed “Proceed.” A Capture/linked/edit form can be dismissed by X, Back or an outside tap and reopened with its unsaved session draft; only Save commits the words. Today long press opens three bottom-sheet action rows. Library/Review Back restores the previous screen state; Today supports double-back exit. Undo can be tapped or dismissed downward. Implementation and partial native/browser evidence are maintained only in `06_CURRENT_STATE.md`; this does not claim physical-device acceptance.

## Approved local workflow extension — 0.5.0 (2026-10-15)

D-017/D-019 approve Reopen without Undo/confirmation, source-linked Tasks, retrieval refinements, local reminders and focused phone checks. Acceptance on the current ARM64 build remains separate from browser and repository verification; see `06_CURRENT_STATE.md` for actual evidence.

- [ ] Install over the previous signed app without clearing data; check saved notes/edits/links, completion, pins, Today note and appearance remain.
- [ ] Reopen a completed Task: it disappears from Review, reappears unpinned in Today, stays pending after restart, and shows no Undo or confirmation.
- [ ] Start New task from a multiline Note; dismiss without committing, reopen/edit/Save, and check exactly one separate Task. Check From note and related-task navigation, independent edits, readable removed source, and offline restart preservation.
- [ ] Use Reflection/Creation filters and Open source; check search and navigation with a realistic existing library.
- [ ] Set an explicitly chosen future reminder, inspect permission and scheduling state, and test notification delivery in foreground/background. Deny permission and disable the notification channel, then restore permission and retry; no scheduled-success claim when blocked.
- [ ] Edit/cancel a reminder and complete/remove its Task; verify old notifications do not fire. Reopen/Undo removal does not reschedule. Reboot with a future reminder and test actual delivery; distinguish Android force-stop restrictions from reboot restoration. Change timezone and confirm the same saved instant displays locally. Inexact alarms may arrive late; this is not a timing guarantee.
- [ ] Check long notes, large system text, narrow layouts, keyboard/form scrolling and navigation on the actual phone; record device model, OS, build and outcomes.

## 0.6.0 phone checks — D-020 (pending)

- [ ] Install over 0.5.0 and launch once: verify prior content/links/appearance persist and old OS notification schedules are cancelled; no new notification prompt appears.
- [ ] Pin more than three Tasks; confirm newest pin first and persisted order after restart. Set a clock time, wait with the app open, then test overdue catch-up after closing/reopening. Already-pinned Tasks retain position; completing/removing cancels a waiting schedule and Reopen never reschedules it.
- [ ] Check the clock, +, U-turn Reopen and expand icons at normal/large system text sizes. Reopen retains no Undo/confirmation.
- [ ] Notes reveals All notes/Reflections/Creations; All/Tasks hides them. Press an original preview to open its source; Back restores the prior filter/search/scroll state.
- [ ] Plain Note cards show linked counts without child text. Expand opens an actual entry screen with actions, preserved source/first capture and grouped Tasks/Reflections/Creations; nested source/child navigation and Back work. Include long text and removed-source cases.

Prior notification-delivery acceptance scenarios above are historical and superseded by D-020. App-closed background pin execution is not an acceptance claim; collect actual device/build results in current state.


## 0.7.0 phone checks — D-021 (pending)

- Install over the existing app without uninstalling; check previous captures, links, pins and chosen Today note survive schema-v6 upgrade.
- Tap Note body to open details; long-press/select/copy words without navigation. Edit/remove/+ and bottom pin must not open the body. Verify at narrow width and larger system text.
- Confirm top-right + on Note/Task/Reflection/Creation and linked cards opens only Reflect/Create/New task. Dismissal saves nothing; forms retain source and independent words. Test Task-to-Task source preview, source edits/removal and independent completion.
- Check/uncheck Tasks in Library, full entry and linked groups. Verify live Today/Review updates and restart durability; completion unpins/cancels schedule, reopening stays unpinned/unscheduled with no Undo/confirmation.
- Inspect clock immediately before Task pin, matching drawn left U-turn/remove controls, bottom-right Today-note pin/selected state, and 44-point targets. Selecting a Today note stays on the current screen; repeated press retains selection.
- Automated evidence belongs in current state. Browser selection/layout checks do not prove Android selection gestures, system-font behavior or native runtime acceptance.


## 0.7.1 focused phone checks — D-022 (pending)

- Today Task rows have no +; the Tasks-panel Add task control still works. Library and entry pending Tasks retain +. Completing hides it in Library/full entry/linked groups; reopening restores it there. Review completed Tasks have no +.
- Task cards show no From note/From task button. Open a Task, then press its original Note/Task preview; verify current and removed sources remain reachable and Back returns correctly.
- Check the revised Task-card spacing, completion controls and clock/pin alignment on a physical phone. Automated verification belongs in current state.
