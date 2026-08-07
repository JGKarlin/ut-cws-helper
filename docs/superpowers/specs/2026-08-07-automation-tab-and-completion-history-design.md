# Automation Tab Reuse and Completion History Design

## Goal

Prevent the side-panel action from creating a second UTokyo CWS session while background automation is running, and make successful current-month time entry visible in 「最近の履歴」.

## Tab reuse behavior

The background controller records the exact Chrome tab ID it creates for a CWS automation run. The record exists only while that tab is owned by the run and is removed during cleanup.

When the user presses 「就労管理システムを開く」, the side panel uses this priority:

1. If the recorded automation tab still exists and is a UTokyo CWS tab, activate it and focus its Chrome window.
2. Otherwise, reuse the most recently accessed existing UTokyo CWS tab and focus its window.
3. Only when no CWS tab exists, create a new active tab at the CWS main URL.

A stale or closed recorded tab must not cause an error and must never block the fallback behavior. The button must not navigate or replace an unrelated active tab.

## Completion history behavior

The entry state machine must return to the live target-month 勤務表 after all queued field submissions. A completion history event is created only if that verification finds no missing required fields across the complete scheduled-workday set.

The history message uses the verified month and workday count:

> 2026年8月分：勤務時間の入力完了（20勤務日）。出勤・退勤・勤務外時間数を確認済み。

The count is derived from the scheduled workdays detected in the live 勤務表, not from the number of fields submitted in the most recent retry. This lets a resumed partial run report the whole verified month accurately.

Timeouts, navigation errors, and partial field completion must not create a completion event. A verified full-day leave remains exempt from clock entries and does not block month completion. Existing history deduplication continues to prevent repeated daily checks from adding identical completion rows.

## Components

- `background.js` owns the lifecycle of the tracked automation tab ID.
- A pure helper model selects the preferred tab from tracked and discovered CWS tabs so the priority is unit-testable.
- `popup.js` focuses the selected tab/window or creates a tab only when the model returns no reusable tab.
- `content.js` emits the completion event after its existing live table re-verification succeeds.
- `popup.js` renders the explicit completion message through the existing history ledger.

## Verification

Automated tests cover:

- tracked automation tab outranks other CWS tabs;
- a stale tracked ID falls back to an existing CWS tab;
- no CWS tab results in new-tab creation;
- completion copy includes the full verified workday count and all three field types;
- partial or interrupted months do not qualify as complete;
- 「最近の履歴」 remains at the bottom of the side panel.

Live verification must confirm that pressing the button focuses the active automation tab without increasing the CWS tab count, and that the August completion row appears only after every scheduled August workday is complete. No 月次申請 or 確定 action is part of this verification.
