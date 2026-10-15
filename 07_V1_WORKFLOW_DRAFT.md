# Noeting — V1 Workflow Specification (Draft)

> Created: 2026-10-11. Updated: 2026-10-12 (V1.2 wireframe revision). Status: proposed workflow with a small interactive wireframe and limited automated checks; not an approved implementation specification.
> Milestone: design and validate Capture → Today. The examples below are illustrative, not observations from real usage.

## Goal and boundary

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

## M1 native-device smoke checklist — pending, 2026-10-13

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
