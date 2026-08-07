# Landing Navigation and Monthly Status Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the CWS landing-page navigation loop and give the side panel an accurate 12-month status ledger, deduplicated event history, and explicit user-action notification.

**Architecture:** Extract the navigation decision and monthly-status/history rules into dependency-free UMD modules that run in Chrome and under Node's built-in test runner. Keep CWS DOM access in `content.js`, persistent orchestration in `background.js`, and rendering/action wiring in `popup.js`; communicate structured month states rather than parsing progress copy.

**Tech Stack:** Chrome Manifest V3, plain JavaScript, Chrome storage/notifications/side-panel APIs, Node `node:test`, live Chrome verification against CWS.

## Global Constraints

- Retain status history locally for exactly 12 calendar months.
- Live CWS observations override stale cached current state while older events remain in history.
- Read-only discovery and verification must never submit a month.
- Automatic submission remains automatic while it can proceed; only an unrecoverable blocker exposes the month-specific manual action.
- Do not restore session-specific `@FN` URLs or brittle `nth-child` selectors.
- A row marked `年休（日）／年次有給休暇／全日` must never enter the automatic work-time queue.

---

### Task 1: Testable landing-page navigation decision

**Files:**
- Create: `navigation-model.js`
- Create: `tests/navigation-model.test.js`
- Modify: `manifest.json:20-27`
- Modify: `content.js:644-687`

**Interfaces:**
- Produces: `HRNavigation.chooseWorkdayNavigationAction(labels, isCalendarPage)` returning one of `ready`, `input`, `performance`, `menu`, `work`, or `main`.
- Consumes: normalized visible navigation labels collected by `content.js`.

- [ ] **Step 1: Write the failing landing-page test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
let chooseWorkdayNavigationAction;
try { ({ chooseWorkdayNavigationAction } = require('../navigation-model.js')); } catch (_) {}

test('chooses the 就労管理 first hop on the CWS main menu', () => {
  assert.equal(typeof chooseWorkdayNavigationAction, 'function');
  const action = chooseWorkdayNavigationAction(
    ['小', '中', '大', '日本語', 'English', 'ログアウト', '就労管理', '職員評価'],
    false
  );
  assert.equal(action, 'work');
});

test('does not fall back to reloading main when 就労管理 is present', () => {
  assert.notEqual(chooseWorkdayNavigationAction(['就労管理'], false), 'main');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/navigation-model.test.js`

Expected: FAIL on `typeof chooseWorkdayNavigationAction` because the production function does not exist.

- [ ] **Step 3: Implement the minimal pure decision module**

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HRNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function chooseWorkdayNavigationAction(labels, isCalendarPage) {
    if (isCalendarPage) return 'ready';
    const values = Array.isArray(labels) ? labels : [];
    if (values.some(t => t.includes('本人用実績入力'))) return 'input';
    if (values.some(t => t.includes('本人用実績') && !t.includes('本人用実績入力'))) return 'performance';
    if (values.some(t => t.includes('就労メインページ') || t.includes('本人用メニュー') || t.includes('メインページ'))) return 'menu';
    if (values.some(t => t === '就労管理')) return 'work';
    return 'main';
  }
  return { chooseWorkdayNavigationAction };
});
```

Load `navigation-model.js` before `content.js` in `manifest.json`. Refactor `clickWorkdayCalendarLink()` to select the matching real link for the returned action and preserve the existing `{ ready }` / `{ navigating, clicked, step, waitMs }` contract.

- [ ] **Step 4: Run focused tests and syntax checks**

Run: `node --test tests/navigation-model.test.js && node --check navigation-model.js && node --check content.js`

Expected: 2 tests PASS and both syntax checks exit 0.

- [ ] **Step 5: Commit the isolated navigation repair**

```bash
git add navigation-model.js tests/navigation-model.test.js manifest.json content.js
git commit -m "fix: recognize CWS landing page in workday navigation"
```

### Task 2: Monthly status ledger and retained history model

**Files:**
- Create: `status-model.js`
- Create: `tests/status-model.test.js`

**Interfaces:**
- Produces: `HRStatusModel.buildMonthRows(input)`, `HRStatusModel.statusEventsFromSnapshot(previous, next, observedAt)`, and `HRStatusModel.appendHistoryEvent(history, event, currentMonth)`.
- Consumes: CWS month cache entries shaped as `{ month, label, submittable, submitted, approval }`, plus structured `pending`, `activeRun`, `userAction`, and `autoSubmitEnabled` state.

- [ ] **Step 1: Write failing tests for submitted visibility and independent July state**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
let buildMonthRows, statusEventsFromSnapshot, appendHistoryEvent, classifyBackgroundOutcome;
try { ({ buildMonthRows, statusEventsFromSnapshot, appendHistoryEvent, classifyBackgroundOutcome } = require('../status-model.js')); } catch (_) {}

test('keeps June visible as submitted and awaiting approval', () => {
  assert.equal(typeof buildMonthRows, 'function');
  const rows = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-05': { month: '2026-05', approval: 'approved', submittable: false },
      '2026-06': { month: '2026-06', approval: 'pending', submitted: true, submittable: false },
      '2026-07': { month: '2026-07', approval: 'none', submittable: true }
    },
    pending: { targetMonth: '2026-07', prevMonth: '2026-06' },
    autoSubmitEnabled: true
  });
  assert.equal(rows.find(r => r.month === '2026-06').state, 'submitted-pending');
  assert.equal(rows.find(r => r.month === '2026-07').state, 'waiting-approval');
});

test('only user-action-required exposes a manual action', () => {
  const rows = buildMonthRows({
    currentMonth: '2026-08',
    months: { '2026-07': { month: '2026-07', submittable: true, approval: 'none' } },
    autoSubmitEnabled: true,
    userAction: { month: '2026-07', message: '自動申請を完了できませんでした' }
  });
  assert.equal(rows[0].state, 'user-action-required');
  assert.equal(rows[0].actionMonth, '2026-07');
});
```

- [ ] **Step 2: Write failing history tests**

```js
test('deduplicates unchanged events and retains only 12 months', () => {
  const existing = [{ id: '2026-07:submitted:submitted-pending', month: '2026-07', type: 'submitted', state: 'submitted-pending', at: 1 }];
  const same = appendHistoryEvent(existing, { month: '2026-07', type: 'submitted', state: 'submitted-pending', at: 2 }, '2026-08');
  assert.equal(same.length, 1);

  const pruned = appendHistoryEvent(same, { month: '2025-07', type: 'approved', state: 'approved', at: 3 }, '2026-08');
  assert.equal(pruned.some(e => e.month === '2025-07'), false);
});

test('records a live correction without deleting earlier history', () => {
  const events = statusEventsFromSnapshot(
    { '2026-06': { month: '2026-06', approval: 'none', submittable: true } },
    { '2026-06': { month: '2026-06', approval: 'pending', submitted: true, submittable: false } },
    10
  );
  assert.deepEqual(events.map(e => [e.month, e.state]), [['2026-06', 'submitted-pending']]);
});
```

- [ ] **Step 3: Run status tests and verify RED**

Run: `node --test tests/status-model.test.js`

Expected: FAIL on the function-type assertion because the model exports do not exist.

- [ ] **Step 4: Implement the minimal status/history model**

Implement literal state precedence: `user-action-required` > `processing` > `waiting-approval` > live submitted/approved/returned/submittable state. Generate stable dedupe IDs as `${month}:${type}:${state}` and prune events whose month is earlier than `monthMinus(currentMonth, 11)`.

- [ ] **Step 5: Run the model suite and mutation check**

Run: `node --test tests/status-model.test.js`

Expected: all tests PASS. Temporarily changing the June mapping from `submitted-pending` to `ready-auto` must fail the first test; restore immediately and rerun PASS.

- [ ] **Step 6: Commit the status model**

```bash
git add status-model.js tests/status-model.test.js
git commit -m "feat: model monthly status and retained history"
```

### Task 3: Render current status and history in the side panel

**Files:**
- Modify: `popup.html:250-330`
- Modify: `popup.js:600-810`
- Modify: `tests/status-model.test.js`

**Interfaces:**
- Consumes: `HRStatusModel.buildMonthRows(...)` and `hrTermStatusHistory`, `hrBackgroundRun`, `hrUserActionRequired`, `hrPendingSubmit` storage values.
- Produces: month rows with Japanese state copy, a newest-first activity list, and `.term-submit-btn[data-month]` only for `user-action-required`.

- [ ] **Step 1: Add failing view-model copy assertions**

```js
test('provides explicit Japanese copy for submitted June and waiting July', () => {
  const rows = buildMonthRows(juneSubmittedJulyWaitingFixture);
  assert.equal(rows.find(r => r.month === '2026-06').message, '2026年6月分：提出済み（承認待ち）');
  assert.match(rows.find(r => r.month === '2026-07').message, /2026年6月分の承認待ち/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/status-model.test.js`

Expected: FAIL because the model does not yet return Japanese `message` text.

- [ ] **Step 3: Add minimal copy fields and panel markup**

Add `#termCurrentStatus` and `#termHistory` containers. Render every relevant 12-month row, mark stale fallback data visibly, and render history timestamps newest first. Keep the existing guarded `startTermSubmission([month])` handler for action-required buttons; do not add a new submission path.

- [ ] **Step 4: Make discovery merge rather than discard known month state**

When a scan completes, merge its `months` into the prior cache, mark the scan timestamp/current month, derive transition events with `statusEventsFromSnapshot`, append them to `hrTermStatusHistory`, and save both values atomically. Extend `termScanStep()` so a page that explicitly says the previous month is finally approved adds that previous month as `{ approval: 'approved', submittable: false }` before stopping.

- [ ] **Step 5: Run tests and syntax checks**

Run: `node --test tests/*.test.js && node --check popup.js && node --check content.js`

Expected: all tests PASS and syntax checks exit 0.

- [ ] **Step 6: Commit the panel ledger**

```bash
git add popup.html popup.js content.js tests/status-model.test.js
git commit -m "feat: show monthly status ledger and history"
```

### Task 4: Structured background progress and action-required notification

**Files:**
- Modify: `background.js:230-430`
- Modify: `content.js:1150-1450`
- Modify: `popup.js:780-880`
- Modify: `popup.html:150-250`
- Modify: `tests/status-model.test.js`

**Interfaces:**
- Produces storage keys `hrBackgroundRun = { month, state, startedAt }`, `hrUserActionRequired = { month, message, since, signature }`, and `hrTermStatusHistory = Array<HistoryEvent>`.
- Produces pure helper `HRStatusModel.classifyBackgroundOutcome(month, progress)` returning `{ completed, userAction }` so timeout/error policy is tested without mocking Chrome.
- Produces content-to-background message `TERM_HISTORY_EVENT` with `{ month, type, state, message, at }`.
- Consumes the existing guarded `startTermSubmission([month])` action.

- [ ] **Step 1: Add a failing background-outcome policy test**

```js
test('requires user action for an error but not an approval wait', () => {
  assert.equal(typeof classifyBackgroundOutcome, 'function');
  assert.deepEqual(
    classifyBackgroundOutcome('2026-07', { error: true, message: '確認してください' }),
    { completed: false, userAction: { month: '2026-07', message: '確認してください' } }
  );
  assert.deepEqual(
    classifyBackgroundOutcome('2026-07', { done: true, waitingApproval: true }),
    { completed: true, userAction: null }
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/status-model.test.js`

Expected: FAIL because `classifyBackgroundOutcome` is not exported.

- [ ] **Step 3: Implement outcome classification and structured run lifecycle**

Add `classifyBackgroundOutcome(month, progress)` to `status-model.js`. At `driveSubmitInBackgroundTab` start, set `hrBackgroundRun` and append one `processing-started` history event. On confirmed completion, append `processing-completed`; on error/timeout, use the helper to set `hrUserActionRequired`, append `action-required`, and send one deduplicated desktop notification. Clear `hrBackgroundRun` in `finally`. Do not mark approval waiting as user action required.

- [ ] **Step 4: Emit confirmed content-script transitions**

From `markTermSubmitted`, emit `submitted/submitted-pending` and clear any matching `hrUserActionRequired`. From `handleTermBlocked`, emit `waiting-approval` without a manual action. Preserve existing submission confirmation and approval gates.

- [ ] **Step 5: Wire live panel updates**

Extend the storage listener to rerender when status cache, history, background run, pending submission, automatic-submission toggle, or user-action state changes. The action-required button must invoke the existing confirmation dialog and must never auto-click itself.

- [ ] **Step 6: Run the complete automated verification**

Run: `node --test tests/*.test.js && node --check navigation-model.js && node --check status-model.js && node --check content.js && node --check popup.js && node --check background.js`

Expected: all tests PASS; all five syntax checks exit 0.

- [ ] **Step 7: Commit background/status integration**

```bash
git add background.js content.js popup.js popup.html tests/status-model.test.js
git commit -m "feat: surface background status and required actions"
```

### Task 5: Exclude full-day paid leave from automatic work-time entry

**Files:**
- Create: `term-hours-model.js`
- Create: `tests/term-hours-model.test.js`
- Modify: `manifest.json`
- Modify: `content.js:934-986`

**Interfaces:**
- Produces: `HRTermHours.isFullDayPaidLeave(rowText)` and `HRTermHours.findMissingWorkdays(workdays, rowFacts)`.
- Consumes row facts shaped as `{ day, hasArrival, hasDeparture, rowText }` extracted read-only from the live 勤務表.

- [ ] **Step 1: Write failing safety tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
let isFullDayPaidLeave, findMissingWorkdays;
try { ({ isFullDayPaidLeave, findMissingWorkdays } = require('../term-hours-model.js')); } catch (_) {}

test('excludes full-day paid leave from missing work time', () => {
  assert.equal(typeof findMissingWorkdays, 'function');
  const missing = findMissingWorkdays(
    ['2026-07-10'],
    [{ day: 10, hasArrival: false, hasDeparture: false, rowText: '7/10 金 年休（日） 年次有給休暇 全日' }]
  );
  assert.deepEqual(missing, []);
});

test('keeps a normal blank weekday missing', () => {
  assert.deepEqual(
    findMissingWorkdays(['2026-07-09'], [{ day: 9, hasArrival: false, hasDeparture: false, rowText: '7/9 木' }]),
    ['2026-07-09']
  );
});

test('does not classify partial-day leave as full-day paid leave', () => {
  assert.equal(isFullDayPaidLeave('年休（時間） 2時間'), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/term-hours-model.test.js`

Expected: FAIL on the missing production function assertion.

- [ ] **Step 3: Implement the pure safety model**

Normalize whitespace and classify a row as full-day paid leave only when it contains `全日` and at least one of `年休（日）` or `年次有給休暇`. `findMissingWorkdays` returns a date only when its row is absent or lacks either time and is not classified as full-day paid leave.

- [ ] **Step 4: Integrate the gate before queue construction**

Load `term-hours-model.js` before `content.js`. Refactor `detectHoursComplete()` to extract `rowText`, arrival/departure presence, and day number, then call `findMissingWorkdays`. Do not clear or modify any existing live values.

- [ ] **Step 5: Run focused and complete tests**

Run: `node --test tests/term-hours-model.test.js && node --test tests/*.test.js && node --check term-hours-model.js && node --check content.js`

Expected: all tests PASS and both syntax checks exit 0.

- [ ] **Step 6: Commit the safety gate**

```bash
git add term-hours-model.js tests/term-hours-model.test.js manifest.json content.js
git commit -m "fix: skip full-day leave in automatic time entry"
```

### Task 6: Live non-submitting Chrome verification

**Files:**
- Modify only if verification exposes a demonstrated defect in the planned behavior.

**Interfaces:**
- Consumes: the unpacked extension reloaded in Chrome and the live CWS session.
- Produces: evidence that navigation and reporting work without clicking `月次申請` or `確定`.

- [ ] **Step 1: Reload the unpacked extension and CWS page**

Reload the extension from `chrome://extensions`, then reload/open the CWS landing page. Do not activate any month-specific submission button.

- [ ] **Step 2: Verify the repaired first hop**

Trigger only the workday-status discovery path and observe `メインメニュー → 就労管理` instead of a reload of `/cws/cws`. Confirm progress advances beyond 2%.

- [ ] **Step 3: Verify current status against live CWS**

Open the side panel and confirm it reports:

- `2026年6月分：提出済み（承認待ち）`
- July as a separate current state
- May as finally approved if present in the live scan/history

- [ ] **Step 4: Verify history and safety**

Confirm that repeated unchanged refreshes do not duplicate entries, that history is newest first, and that no `月次申請` or `確定` action was performed during verification. Confirm from a read-only July 10 inspection that the full-day leave marker excludes the date from the computed missing-work queue; do not clear or edit its current live values.

- [ ] **Step 5: Run final repository checks**

Run: `git diff --check && node --test tests/*.test.js && node --check navigation-model.js && node --check status-model.js && node --check term-hours-model.js && node --check content.js && node --check popup.js && node --check background.js && git status --short`

Expected: no diff errors; all tests and syntax checks PASS; status shows only intentional files or is clean after commits.
