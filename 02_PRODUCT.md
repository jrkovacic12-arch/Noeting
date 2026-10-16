# Noeting — Product Requirements and Workflows

> **Status:** High-level V1 feature scope accepted on 2026-10-12 (D-010); M1 source implemented on 2026-10-13 with real-SQLite automated checks. Physical-device acceptance and remaining V1 workflows are pending.
>
> **Source of truth for:** user needs, product objects, features, UX behavior, and MVP boundaries.

## Target M1 product contract — D-024 (approved direction, not yet implemented)

**Priority:** This current-facing contract supersedes conflicting historical 0.7.1 UX descriptions below. The existing shipped/tested source remains 0.7.1. Here “M1” means the *new minimalist refactor baseline*, not the original 2026-10-13 M1 milestone.

| Screen | Behavior |
| --- | --- |
| Notes | Primary Notes destination: list, note-content search bar, + creates a standalone Note. Historical Reflection/Creation records appear as ordinary Notes. |
| Tasks | Primary Tasks destination: list, task-content search bar, + creates a standalone pending Task. Display completion state and allow Complete/Reopen without confirmation. |
| Note/Task entry detail | Tap any list item to read its full text, edit/remove it, inspect its source (if linked), browse its children and navigate to related entry details. |
| Linked creation | **Only from an existing entry-detail screen**, allow “Link note” or “Link task.” Save produces a separate Note/Task with an explicit source; dismiss creates nothing. All four Note/Task source-target combinations are supported. |

**User owns meaning:** No Reflection/Creation entry type, button, filter, prompt, template or forced writing classification. Do not infer meaning from content. Preserve past classification metadata invisibly for compatibility, never mislabel or drop old words.

**Remove from target navigation/UI:** Today, Review, selected Today Note, daily summary dashboard, pins and scheduled-pin controls, dedicated Settings destination, generic Capture screen, extra organizational taxonomies, priority/deadline forms, AI surfaces. Two tabs only, each with a context-specific +; no linked-create + on list cards. System-following theme is the baseline. Retain basic note/task edit/remove and task complete/reopen.

**Persistence:** Keep original capture words immutable, edits separately persisted, source links and source snapshots intact, and Note/Task records independent across removal, completion and retry. Offline, transactional and duplicate-safe saves. Removing UI features does *not* authorize deleting old data or migration scripts. No account, sync or AI. D-018 still defers export/restore; local-only data-loss risk must be disclosed.

**Source of truth:** [D-024](05_DECISIONS.md) records the decision, [03_ARCHITECTURE.md](03_ARCHITECTURE.md) owns safe migration, [04_ROADMAP.md](04_ROADMAP.md) the Codex implementation, [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md) the acceptance tests.

## 1. Validated observations and newly expressed needs

**Observed during Obsidian trial (self-report):**
- Main behavior: note thoughts, plans, to-dos, and review them later.
- This behavior is useful and worth retaining.
- Desired improvements: categorize into thoughts/sources/experiments/creations/etc.; daily summaries; task and priority reminders; potential AI assistance.
- Time and task management are difficult; too many things to do can feel overwhelming.

**Working product problem:** Notes and commitments accumulate faster than they are clarified, prioritized, acted on, and reconsidered.

The user reported testing the revised prototype and that it **worked as intended**; device, participant details, and per-scenario outcomes were not supplied. No quantitative user research or market validation has been recorded.

## 2. Core user jobs

1. **Capture:** “I have a thought or obligation; preserve it without interrupting me.”
2. **Clarify:** “Is this an idea, source, experiment, creation, or an actual task?”
3. **Organize:** “Help me find related things without needing complex manual filing.”
4. **Prioritize:** “What matters today, what has a deadline, and what can wait?”
5. **Summarize:** “What happened, what did I capture, and what remains unresolved?”
6. **Remind:** “Notify me of a commitment at the appropriate time, if I set one.”
7. **Reflect/create:** “Help me revisit past beliefs and turn ideas into experiments or original outputs.”

## 3. Terminology (proposed product model)

- **Entry:** A captured item with original text and metadata.
- **Category/type:** The **approved wireframe iteration** exposes only **Note** and **Task** at Capture. Note covers thoughts, observations, questions, ideas and other non-committal content. More detailed semantic types from earlier drafts remain research candidates, **not** required Capture choices or a final storage taxonomy. Existing prototype entries retain their original category values for compatibility.
- **Source:** Where material originated (book, video, conversation, work, personal observation, internal thought, etc.). *Source* as provenance is different from *Source note* as a category; this distinction needs UX validation.
- **Task:** An explicitly accepted actionable commitment, including optional priority, due date, reminder, and status. AI-suggested tasks are proposals, not commitments. The proposed M1 lifecycle is **Pending → Completed** only; deferment remains later research. A manually created task is accepted by the user.
- **Project:** A group of related tasks/entries, if needed.
- **Reflection:** The user's interpretation of a capture or evolving view; optionally linked to a past action or outcome.
- **Experiment:** A user-chosen test of an idea; it may remain a non-committal note or motivate an explicitly accepted task. A mandatory Experiment object is not approved.
- **Review:** Deliberate resurfacing for reconsideration, not only recall.
- **Daily brief:** A finite summary of selected existing information, not an automatically generated to-do list of new obligations.

**Important:** AI may *suggest* classifications or draft tasks; the app must preserve the original capture and distinguish a suggested action from an accepted commitment.

## 4. Historical candidate navigation (superseded by D-024)

The original concept proposed **Capture / Today / Library / Review / Create**. The current **approved research wireframe** uses **Today / Library / Review** in navigation, one persistent header **Capture** button, and **+ Add task** inside Today. A separate Create or Tasks screen is not required for this prototype.

### Capture
- **Original requirement:** Open quickly, choose or infer a type, enter text, optionally assign a source, save, exit.
- **Approved for the current wireframe (2026-10-12):** Capture offers **Note / Task** only. Saving a Task explicitly creates a pending task linked to its original entry; saving a Note creates no task. A Note can still be turned into a Task later only by a deliberate acceptance step.
- **Constraint:** No default AI chat response, feed, congratulatory loop, or unsolicited follow-on content after saving.

### Today
- **Original requirement:** Finite reflection/review/experiment/create items with a clear end.
- **Approved for the current wireframe (2026-10-12):** One **Tasks** panel with each pending task shown once; users may pin/unpin up to three tasks, which sort to the top. **+ Add task** opens Capture with Task preselected. A single compact daily summary replaces duplicate counters/brief panels; undated tasks have no date placeholder.
- **Constraint:** Not every captured idea becomes a daily action; missed days bring no streak penalty. **Wireframe simplification:** remove the redundant **Skip for today** action from *Think, then return*, which remains optional.

### Library
- **Original requirement:** Search and lightweight access to thoughts, observations, questions, experiments, creations, and sources.
- **Proposed addition:** Search/filter tasks and projects, without excessive taxonomy management.

### Review
- **Original requirement:** Revisit a past thought and ask what changed, what still holds, and what contradicts it.
- **Proposed addition:** Review unfinished commitments and past priority choices without shaming or engagement pressure.

### Create
- **Original requirement:** Synthesize related thoughts into an essay, principle, decision, design, software idea, project, or other original result.
- **Constraint:** This should remain a first-class capability even as task management expands.

## 5. Agreed first working app scope (high-level V1)

**Accepted V1 direction (D-010, as revised by D-018 and D-020); core Capture/Today/Library/Review workflows are implemented in 0.7.1 source. Device acceptance and separate deadline/priority decisions remain open:**

- **Capture:** Note / Task; preserve exact original text, save locally, then close without unsolicited follow-up. Direct Task capture creates a user-accepted task; a linked task from a Note requires deliberate acceptance.
- **Today:** one pending Tasks list, task editing/completion, known due dates, unlimited pinned tasks, newest pin first (each shown once), optional **Today note** with Reflect/Create/Change, and a visible summary card. Explicit stop controls were removed by D-012.
- **Library:** search and filter saved entries; edit/delete through deliberate actions; retain original text when creating linked derived entries.
- **Review:** revisit existing thoughts; **Reflect** and **Create** produce separately authored linked entries; no requirement to create after every capture or task.
- **Scheduled pin:** explicitly chosen date/time pins the Task while open or when next reopened; replaces OS notifications under D-020.
- **Daily overview:** compact deterministic summary drawn from existing records; no fabricated tasks or deadlines.
- **Data reliability and ownership:** on-device SQLite, working offline without an account, durable restart behavior. Backup/export/restore is deferred to the later account phase by D-018.

**Current implementation (0.7.1 source; validation in current state):** Today has a compact accessible + control for adding a Task, one task list, borderless right-edge pins, aligned checkboxes and a serif Today-note card. Direct Note capture atomically replaces the Today note; Tasks and linked Reflect/Create saves do not. Tap a Note body to open entry details; long-press Note text for selection without navigation. Task long-press tools still offer Copy/Edit/Remove, and entry details provides Copy alongside edit/remove controls. Library supports search/filter of current words, edit/remove icons and linked-source retrieval. Review offers removal for completed Tasks and edit/removal for linked thinking. Edits retain first captures; removal hides records across tabs with Undo and preserves dependent reflections. Centered branding and bottom icon navigation (+ in the middle) show at the top/upward scroll, hide on sustained downward scroll and reset on tab changes. Toolboxes slide from the bottom with just Copy/Edit/Remove rows after a 300 ms long press. Outside taps close sheets/forms; session-only drafts restore when reopened. Forms keep X icons and use “Save.” Android Back closes the modal first, then restores the previous Library/Review screen and its scroll/search state; Today alone supports double-back exit within two seconds. Removal offers a small centered “Undo” control that swipes down to dismiss without restoring the item. The supplied symbol and plain Android startup remain. Note-derived Tasks, Reopen, retrieval refinements and scheduled pinning are implemented as described below; separate task deadlines remain unimplemented and export is deferred by D-018.

**Reopen:** Completed Tasks offer Reopen in Review. It removes the Task from Review and returns the same Task, unpinned, to Today. No Undo, confirmation or success prompt. Source links and words remain; completion time clears. A failed write retains the completed Task and allows retry (D-017).

**New task from an entry (D-021):** The top-right + menu on any active Note/Task/Reflection/Creation offers Reflect, Create and New task. A form displays the source read-only and prefills separately editable Task words. Dismissal creates no Task; Save creates one pending, unpinned Task without replacing Today-note selection or leaving the current screen. One source entry can source multiple independent Tasks, including Task-to-Task links without completion dependencies. Task entry screens open their source through the original preview; redundant From note/From task buttons are removed (D-022). Source entry details show related Tasks. Editing/removing either never edits/removes the other. Removed sources remain readable through their links; source-at-creation words are retained (D-019/P-007).

**Retrieval and compact cards (D-020):** Main Library filters are All/Notes/Tasks. Selecting Notes reveals All notes/Reflections/Creations; these subfilters disappear under All/Tasks. The top-right + opens the three-choice linked-action sheet (D-021), except Today Task rows and completed Tasks on all screens (D-022); Reopen is a drawn left U-turn arrow icon with the unchanged no-Undo/no-confirmation behavior. Plain Note cards display own text/actions and nonzero linked counts in the captured-time metadata style, without linked-entry text. Tapping the card text/body opens a separate entry screen with all own actions, original/source text and grouped Task/Reflection/Creation links. Pressing a Reflection/Creation original preview opens its source; no Open source button. Back restores previous list state or the previous entry in nested navigation. Removed sources remain readable through links.

**Completion and Today-note choice (D-021):** Tasks have completion checkboxes in Library, their entry screen and source-screen linked groups. Checking unpins/cancels schedules; unchecking reopens unpinned without restoring schedules, Undo or confirmation. Controls never open the entry body. A bottom-right pin selects a Note for Today without leaving the current view; filled means selected and pressing again does not clear it.

**Scheduled pinning (D-020; replaces notifications):** Pending Tasks expose a clock icon at the right edge immediately before their pin to set/change a future local date and 24-hour time. Save persists the moment as UTC; display follows local time. While open, a timer applies due schedules; startup/foreground catches up overdue pins. Exact background execution while closed is not promised. No notification is sent or permission requested. Upgrade cleanup cancels old OS notifications on first launch and retries failures. Pins have no cap and sort newest pin time first; identical times use persisted pin order. An already-pinned Task stays in place when its schedule arrives. Completing/removing a Task cancels the schedule; Reopen/Undo removal never restores a schedule. Unpinning after a consumed scheduled pin stays unpinned. Manual pins newer than an overdue time remain above that overdue Task.


**Historical M1 boundary (2026-10-13):** The initial implementation covered Capture → Today; subsequent 0.2.0–0.7.1 releases added Library, Review, editing, linked entries, Reopen and scheduled pins. The early M1 contract below remains as migration/test history, not current UX requirements. AI, cloud sync, integrations, autonomous agent actions and advanced organization remain outside V1.

### Historical M1 behavior contract — 2026-10-13 (superseded where D-012–D-022 apply)

These implementation choices apply to the first slice. Automated repository checks exercise the data contract; physical-device acceptance remains pending. The original M1 UI displayed only a saved-note count; the subsequent read-only Library slice now retrieves those same schema v1 records.

- Capture accepts **Note / Task**. The saved `original_text` is immutable and preserves the exact input, including whitespace and line breaks. Empty or whitespace-only input is rejected without altering the draft. Later editable content or linked entries must preserve that source text.
- A Note creates one Entry and no Task. A direct Task creates one Entry and one linked **Pending** Task in a single successful save. M1 includes **Pending** and **Completed** only; deferment, reopening, due dates, and reminders are deferred.
- Today shows each Pending Task once. Pins apply only to Pending Tasks, with at most three in total; they persist across days and restarts until the user unpins or completes the task. Completion clears its pin and removes it from the pending list.
- Save closes Capture only after persistence succeeds. A failed save keeps the dialog, input, and capture type intact, with a visible error and a retry action. Rapid taps or retrying the same capture must not create duplicates. No date or deadline is inferred or invented.
- This minimal task list does not claim to resolve backlog overwhelm. Test it with a realistic backlog before adding the rest of V1.

For IDs, transactions, and retry handling, see [03_ARCHITECTURE.md](03_ARCHITECTURE.md); for pass/fail checks, see the M1 gate in [04_ROADMAP.md](04_ROADMAP.md).

## 6. Candidate workflow requirements (details still being tested)

| Workflow | User-facing behavior to investigate |
| --- | --- |
| Capture | Offer Note / Task; preserve original text locally; a manually captured Task is accepted; Save closes without an unsolicited follow-up. |
| Clarify task | Distinguish an idea from a commitment; user accepts or edits a suggested task; no invented due date. |
| Today | List each pending task once, unlimited user-pinned tasks first (D-020), with + Add task and a deterministic summary; separate due dates are not implemented. |
| Scheduled pin | Require a user-set future date/time; pin when due in the open app or at next launch/resume; no OS notification (D-020). |
| Reflect/create | Revisit a thought and develop a linked reflection, experiment, or original output without overwriting its source. |
| Thinking → action (research proposal) | From a note or reflection, deliberately record an experiment or accept a task if action is warranted; a note may stay a note indefinitely. |
| Action → thinking (research proposal) | After an action, optionally record what happened or what changed as a linked reflection; task completion never requires additional writing. |

The two proposed handoffs must remain user-initiated, non-blocking, and optional. They do **not** require new navigation, AI, a separate Create screen, or a new storage entity in V1. The **illustrative inputs, interaction sketches, example outcomes, and prototype test cases** belong only in [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). They are not observed usage or accepted V1 scope.

## 7. Capabilities by maturity

The status below is for a working product, not the interactive research wireframe; see `07_V1_WORKFLOW_DRAFT.md` for prototype evidence.

| Capability | Priority | Current status |
| --- | --- | --- |
| Fast manual capture | Essential foundation | M1 source implemented; physical-device validation pending |
| Basic categories and search | Essential foundation | Note/Task capture and read-only Library search/filter implemented; native validation evidence is in `06_CURRENT_STATE.md` |
| Explicit tasks and status | Essential foundation | M1 direct tasks and Pending/Completed implemented; broader lifecycle open |
| Pinned tasks and separate deadlines | Pinned tasks implemented; deadlines unresolved | Unlimited manual/scheduled pins implemented (D-020); no distinct priority rank or task deadline |
| Scheduled pins (not reminders) | Accepted interaction | Implemented in 0.6.0; foreground/launch catch-up, not notification delivery |
| Daily summary | High | Visible deterministic current-record summary card implemented; no AI or modal |
| AI classification/task suggestions | High-interest experiment | Proposed; needs privacy/accuracy test |
| AI priority proposals | High-interest experiment | Proposed; must remain user-confirmed |
| Spaced reflection/review | Core vision | Basic completed-task and linked-thinking Review implemented; spaced scheduling remains future |
| Creation/synthesis | Core vision | Deliberate linked Reflect/Create implemented; advanced synthesis remains future |
| Local model integration | Architectural research | Unchosen |
| Desktop, sync, external integrations, agent actions | Later | Not MVP commitments |

**The core approved local workflows through D-022 are implemented in 0.7.1 source; this does not establish all V1 acceptance gates.** The user subsequently requested simulated-phone testing; keep emulator results separate from physical-device acceptance, with no AI in V1. Actual run/test evidence is maintained in [06_CURRENT_STATE.md](06_CURRENT_STATE.md).

### Minimalist interface constraints (D-023)

Prefer a small Capture/Today/Library/Review interface and voluntary linked thinking to editor formatting, nested taxonomies, graphs or new screens without demonstrated need. Keep Xiaomi Notes a UX reference rather than an assumed integration. [D-023](05_DECISIONS.md) owns the decision; [04_ROADMAP.md](04_ROADMAP.md) owns unapproved later AI experiments. No agent feature is part of V1.

## 8. UX and safety constraints

- No infinite feeds, autoplay, trending content, streaks, scoring, pressure notifications, or AI chatter.
- Do not infer deadlines from vague language as if they were facts.
- Never silently convert a thought into an obligation.
- Do not require a task, experiment, reflection, or creation as the price of capturing a note or completing a task.
- Show a distinction between **original user text**, **AI suggestion**, and **accepted task/priority**; AI can suggest and ask for permission but must not silently commit tasks, priorities, or reminders.
- Permit editing saved words and accepted tasks; do not imply editable categories, ranked priorities or generated summaries exist before those capabilities are designed.
- Keep daily recommendations bounded and explainable.
- Current scheduled pins do not send notifications; do not imply background alert delivery.
- The core capture/task experience must remain usable without an internet connection. AI is outside V1; any later offline AI behavior remains an open implementation question.

## 9. Product validation outcomes and evidence gaps

Validation must establish whether the experience **reduces organizational effort and overload**, distinguishes ideas from commitments, supports retrieval, protects attention, and preserves a path to reflection/creation. Specifically test whether users can (a) leave a thought untouched, (b) deliberately develop it into an experiment or accepted action, and (c) optionally reflect after finishing an action, **without additional forced steps or duplicate tasks**. Reminder reliability, offline behavior, and consent comprehension also need evidence.

For prototype checks and the pending native-device checklist, see [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md). The earlier prototype used simulated browser checks and user self-report without device/per-scenario details. M1 now has real-SQLite automated evidence, maintained in [06_CURRENT_STATE.md](06_CURRENT_STATE.md); physical-device restart durability, scheduled-pin catch-up, offline native behavior, security, and broader product validation remain untested.

## 10. Unresolved product research questions

- Which candidate entry labels are understandable, and how should source provenance appear?
- Does a finite Today experience with at most three confirmed priorities make actual commitments clearer?
- What belongs in a brief, how should it be reviewed, and when does a task count as deferred?
- Does the simple linked-creation path support original thinking without requiring a separate V1 Create screen?
- Are voluntary thinking-to-action and action-to-reflection handoffs understandable and useful in real life, or do they add cognitive overhead?

The **canonical register of open product and technical decisions** is [05_DECISIONS.md](05_DECISIONS.md) (O-001–O-008). See [03_ARCHITECTURE.md](03_ARCHITECTURE.md) for unresolved technical investigations and [06_CURRENT_STATE.md](06_CURRENT_STATE.md) for the exact next action.

### Appearance settings — D-016

Settings offers Light, Dark and Same as system through accessible radio rows. System is the default; explicit choices override device appearance and persist locally across restarts. Apply the palette consistently to every screen, form, toolbox, card, icon and status bar. Show a retryable error and restore the previous choice if a preference write fails.
