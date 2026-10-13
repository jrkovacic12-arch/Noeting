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

## M1 native-device smoke checklist — pending, 2026-10-13

Record device model, Android version, ABI, APK/build identity, connection state, and each result in `06_CURRENT_STATE.md`. The user confirmed Android as the initial target; no device run is claimed. The expected standalone test APK is ARM64 (`arm64-v8a`) for Android **7.0+ / API 24**, with its bundle embedded; its artifact, architecture/SDK support, and runtime are **not yet validated**. The current dependency-network blocker and build/verification commands are maintained only in `06_CURRENT_STATE.md`.

- [ ] Confirm the build completed and the static APK verifier passed before transfer. The expected ignored artifact path is `artifacts/noeting-m1-android-arm64-test.apk`; no APK exists yet. Record its SHA-256 and signer-certificate digest from verification, then confirm the phone is ARM64 and Android 7.0 or newer.
- [ ] Install the verified test APK on the chosen phone and record install/launch results. With a USB-connected authorized device, use `adb install -r artifacts/noeting-m1-android-arm64-test.apk`; otherwise transfer the verified file and use the phone's package installer. Do not uninstall existing app data to resolve a signing mismatch: preserve it and investigate. This expected APK uses a development key and placeholder identity/branding, not store-release signing.
- [ ] Launch the installed app without Metro or Expo Go. Confirm it reaches Today; record any crash or startup-storage error before testing. A preview that depends on a development server does not establish standalone cold-start behavior.

- [ ] Capture a multiline Note with leading/trailing whitespace: no Task appears, Capture closes only after save, and the note count increases. Original-text equality is covered by repository tests; inspect the development database if verifying it on-device, since M1 has no Library reader yet.
- [ ] Use **+ Add task**: Task is preselected; save creates one pending row. Rapid Save taps create no duplicate. Close/reopen Capture and verify normal Note/Task entry and keyboard behavior.
- [ ] Create four tasks, pin three, confirm the fourth cannot be pinned; unpin one and pin another. Complete a pinned task: it disappears from pending tasks and frees its pin.
- [ ] Enable airplane mode, force-stop the installed app, and relaunch it: note count, pending task identities/order, completion, and pins persist. Capture another item offline, repeat force-stop/relaunch, and record that it loads without Metro or another server. Also restart the phone and confirm the saved state remains available offline.
- [ ] Use **Finish session**: it reaches the deliberate stop; **Return to Today** resumes without new tasks or prompts. Check errors/failed-save input retention with a controlled development failure harness if available; automated failure checks do not establish native-device error behavior.

OS reminders, Library retrieval, Review/Reflect/Create, export/restore, and security acceptance are outside this M1 smoke checklist and remain later V1 work.
