# Landing Navigation and Monthly Status Repair

## Problem

The unattended workday scan can loop on the CWS `メインメニュー` page because its text-based navigation recognizes deeper links but omits the first-hop `就労管理` link. The monthly-submission card can also show stale information: the live CWS system confirms that June 2026 was submitted and is awaiting approval, while the panel still reports May and omits June.

## Required behavior

1. From the CWS `メインメニュー`, navigation toward `本人用実績入力` must click the visible `就労管理` link instead of reloading the same URL.
2. The monthly-submission card must report submitted months even when no action is available. In the observed state it must show `2026年6月分：提出済み（承認待ち）`.
3. July must be shown independently as one of: waiting for June approval, processing in the background, ready for automatic submission, submitted and awaiting approval, or user action required.
4. When automatic submission is enabled, no manual button is shown merely because a month is unsubmitted; the extension continues automatically whenever it can.
5. If progress is blocked and the user genuinely must act, the card shows a prominent explanation and a month-specific submission action. A single desktop notification is also sent so the blocker is visible while the panel is closed.
6. Read-only discovery and rendering must never submit a month. Existing confirmation and submission safeguards remain authoritative.

## Design

### Navigation

Keep the current text-based, stateless navigation. Add a `就労管理` match before the fallback-to-main-page branch. Do not restore session-specific `@FN` URLs or brittle `nth-child` selectors.

### Monthly status model

Treat each recent month as a status row rather than filtering the card down to actionable candidates. Merge the most recent CWS scan with explicit extension state such as background progress and pending submission. Submitted status remains visible until the CWS scan reports final approval; it is not hidden simply because the month is no longer submittable.

The row priority is:

1. Live CWS status from the newest completed scan.
2. Confirmed submission written by the submission state machine.
3. Persisted pending/background state.
4. Older cache only as a visibly stale fallback when a refresh fails.

### User-action notification

Only a state that automation cannot resolve produces `user action required`. The card names the affected month, explains the blocker, and presents the existing guarded submission flow as its action. The desktop notification is deduplicated per month and blocker state.

## Testing

- A landing-page fixture containing only the `就労管理` first-hop must select that link and must not choose the fallback reload.
- A status fixture with June submitted/pending must render June even if May is also present.
- July waiting, processing, automatic, and user-action-required states must render distinct copy and only the last state may show the manual action.
- Read-only rendering tests must prove that no submission message or click occurs.
- JavaScript syntax checks and a live, non-submitting Chrome walkthrough verify the repaired route and displayed statuses.

## Scope

This repair does not change approval policy, automatically bypass CWS safeguards, or submit any month during verification.
