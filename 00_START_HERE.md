# Noeting — Start Here


## Current development scope — manual two-way sync (2026-10-19)

The uploaded implementation task explicitly authorizes S1–S3 on draft PR #13, superseding earlier no-sync priority only. Development source is `feat/pc-sync-readonly-mirror-20261018`, application version 0.10.3/code 20 with additive **schema v11**; this is not a newly accepted production release. Read the v2 sections in `03_ARCHITECTURE.md` for architecture and exact setup, D-028 in `05_DECISIONS.md` for scope, and `06_CURRENT_STATE.md` for actual checks and remaining acceptance. Earlier baseline headers describe the merged v10 release. Disposable test data only; no AI/accounts/backup or production-security authorization.
> **Documentation refreshed:** 2026-10-18 (post-PR #9 merge and user-confirmed test-phase scope)
>
> **Motto:** *Notice. Note. Think. Originate from nothing.*

## 1. Project overview

**Noeting** is a proposed privacy-first, local-first personal thinking and action system. It aims to make capturing, clarifying, prioritizing, reflecting, and creating easier without becoming an attention-consuming feed. A permission-controlled personal AI agent is a longer-term direction, not an MVP requirement.

For founding principles and the two thinking/action loops, read [01_VISION.md](01_VISION.md). For observed Obsidian usage and product needs, read [02_PRODUCT.md](02_PRODUCT.md). **Only [06_CURRENT_STATE.md](06_CURRENT_STATE.md) maintains the current status, blockers, and exact next action.**

> **Current baseline:** Version 0.10.3/code 20/schema v10 is merged through PRs #8 and #9. Main CI passed; the user reports all N1–N9 Android checks completed successfully, and all present data are disposable tests. Detailed physical-device evidence and exact status belong only to `06_CURRENT_STATE.md`. Current Notes/Tasks behavior is defined at the start of `02_PRODUCT.md`; earlier Today/Review/scheduled-pin descriptions are historical, not current UI requirements. Only `06_CURRENT_STATE.md` maintains the current next action.

## 2. Document index — one owner per topic

| File | Authoritative responsibility |
| --- | --- |
| [00_START_HERE.md](00_START_HERE.md) | Entry point and session/document handling |
| [01_VISION.md](01_VISION.md) | Philosophy, purpose, identity, and long-term design principles |
| [02_PRODUCT.md](02_PRODUCT.md) | User needs, terminology, UX requirements, and candidate scope |
| [03_ARCHITECTURE.md](03_ARCHITECTURE.md) | Technical options, data and security design, enforcement boundaries |
| [04_ROADMAP.md](04_ROADMAP.md) | Phases, work items, exit criteria, and milestone history |
| [05_DECISIONS.md](05_DECISIONS.md) | Accepted decisions, unaccepted proposals, and open-decision register |
| [06_CURRENT_STATE.md](06_CURRENT_STATE.md) | Latest verified progress, blockers, and **sole exact next action** |
| [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md) | Illustrative scenarios, sketches, prototype checklist, and automated-test evidence |
| [archive/noeting-original.md](archive/noeting-original.md) | Authentic, unchanged founding note (primary source) |
| [CHANGELOG.md](CHANGELOG.md) | Dated change history (not a source of current tasks or requirements) |

The authentic [original Noeting note](archive/noeting-original.md) is packaged verbatim. Its separate historical archival README was not provided, so it is not included in this handoff. Treat the founding note as the primary source; later documents record expanded requirements and proposals.

## 3. Read order for the next session

1. When resuming from a handoff ZIP, upload it and read this entry point and [06_CURRENT_STATE.md](06_CURRENT_STATE.md) first.
2. Read the current contracts at the start of [02_PRODUCT.md](02_PRODUCT.md) and [03_ARCHITECTURE.md](03_ARCHITECTURE.md), D-018/D-024–D-027 in [05_DECISIONS.md](05_DECISIONS.md), and the current gates in [04_ROADMAP.md](04_ROADMAP.md). [07_V1_WORKFLOW_DRAFT.md](07_V1_WORKFLOW_DRAFT.md) owns acceptance procedures; its historical prototype/Today sections and the HTML prototype are not current UI requirements.
3. Consult [05_DECISIONS.md](05_DECISIONS.md) before treating a proposal as accepted; open other files only as relevant to the task.
4. Consult [archive/noeting-original.md](archive/noeting-original.md) directly when interpreting or preserving the founding concept.

## 4. Collaboration and evidence rules

- Distinguish **observed/self-reported**, **accepted direction**, **proposal**, **open question**, and **implemented/verified**.
- Never claim that an unbuilt feature, unrun test, selected stack, privacy property, or AI workflow is proven.
- Preserve the original user text; distinguish AI suggestions from user-accepted commitments, and keep AI permissions explicit.
- Prefer small testable steps; do not prematurely add sync, complex graphs, broad integrations, or an autonomous general agent.
- Do not invent commitments, deadlines, priorities, product validation, or test outcomes.
- Refer to the authoritative document for each topic; avoid independently maintaining its details elsewhere.

### AI communication preferences

- Keep responses short, concise, and focused, preferably under 200 words.
- Prioritize direct answers over lengthy explanations.
- Avoid filler, repetition, unnecessary introductions, and closing remarks.
- If a response would need to exceed 200 words, first ask the user for permission to provide a longer answer. Do not send the extended response until permission is granted.
- If permission is not granted, give the most useful accurate answer within 200 words and state any material limitations briefly.
- if needed to proceed user's request, ask for additional files/details.
- Provide additional detail only when necessary for accuracy or explicitly requested.
- Apply these preferences during future project sessions whenever this document is available.
- Edit existing authoritative Markdown files for project updates and handoffs. Do not create additional `.md` files, including session-specific README files, without explicit user permission.
- Keep project files and handoff packages precise and nonredundant: store each instruction, decision, and status in its designated file, then reference it rather than duplicating it.
- Do not initiate or prepare session handoffs, including ZIP packages, unless the user explicitly requests one.
- For meaningful project or policy changes, append a brief dated entry to `CHANGELOG.md` without duplicating the authoritative records; this does not require a handoff.

### Testing and delivery pace — user preference recorded 2026-10-14

- Match verification to the change. For small, reversible UI edits, run type checking and a focused workflow/layout check; reuse relevant previous results instead of repeating unchanged database or full emulator suites.
- Keep simulator troubleshooting bounded: make one focused retry when a failure appears to be tooling or timing. If it still fails without evidence of an app defect, use available focused checks, record the unverified coverage clearly, and deliver the verified test APK for phone testing.
- Do not spend a session building custom test infrastructure or repeatedly restarting the simulator to obtain an exhaustive green run. Continue investigating when evidence points to a material app/data defect; distinguish it from automation failures.
- Prioritize a usable, reviewable result and timely delivery. Never claim unrun or blocked checks passed.

## 5. Handoff protocol (on explicit request only)

When a handoff is requested, update only where facts genuinely change:

1. `06_CURRENT_STATE.md` — verified work, blockers, exact next task.
2. `04_ROADMAP.md` — changed milestones or task status.
3. `05_DECISIONS.md` — accepted/rejected/superseded decisions, with rationale.
4. `02_PRODUCT.md` / `03_ARCHITECTURE.md` — actual requirement or design changes.
5. `07_V1_WORKFLOW_DRAFT.md` — test cases, prototype findings, scenario revisions while draft.
6. `01_VISION.md` — only when founding principles change.

A handoff should capture **what changed, evidence/artifacts, decisions, unresolved issues, and the next action**. For the current next action, read [06_CURRENT_STATE.md](06_CURRENT_STATE.md); do not copy it into this file.
