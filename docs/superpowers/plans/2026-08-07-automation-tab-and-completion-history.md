# Automation Tab Reuse and Completion History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the exact background CWS automation tab from the side-panel button and record a verified, explicit current-month time-entry completion event in 「最近の履歴」.

**Architecture:** `background.js` owns a session-scoped automation tab ID for the lifetime of a run. Pure selection and completion-message helpers make the behavior testable; `popup.js` focuses a selected tab/window without navigation, while `content.js` emits history only from the existing live-table completion branch.

**Tech Stack:** Chrome Manifest V3 APIs, plain JavaScript, Node.js `node:test`, UTokyo CWS DOM integration.

## Global Constraints

- Never create a second CWS tab when the tracked automation tab or another reusable CWS tab exists.
- Never replace or navigate an unrelated active tab.
- Emit completion history only after the live target-month 勤務表 reports no missing required fields.
- Full-day paid leave remains exempt and does not block completion.
- Do not click or automate 月次申請 or 確定 during live verification.
- Keep 「最近の履歴」 at the bottom of the side panel.

---

### Task 1: Track and reuse the active automation tab

**Files:**
- Modify: `status-model.js`
- Modify: `background.js`
- Modify: `popup.js`
- Modify: `tests/status-model.test.js`

**Interfaces:**
- Produces: `chooseReusableCwsTab(trackedTabId, tabs) -> tab | null` from `status-model.js`.
- Produces: session key `hrAutomationTabId`, containing the numeric tab ID owned by `driveSubmitInBackgroundTab`.
- Consumes: Chrome tab records with `id`, `url`, `windowId`, and optional `lastAccessed`.

- [ ] **Step 1: Write failing selection tests**

Add tests that require the tracked valid CWS tab to outrank newer alternatives, require a stale tracked ID to fall back to the highest-`lastAccessed` CWS tab, reject non-CWS URLs, and return `null` when no CWS tab exists:

```js
test('reuses the tracked automation tab before any other CWS tab', () => {
  const tabs = [
    { id: 10, url: 'https://ut-ppsweb.adm.u-tokyo.ac.jp/cws/cws', lastAccessed: 1 },
    { id: 20, url: 'https://ut-ppsweb.adm.u-tokyo.ac.jp/cws/cws', lastAccessed: 2 }
  ];
  assert.equal(chooseReusableCwsTab(10, tabs).id, 10);
  assert.equal(chooseReusableCwsTab(999, tabs).id, 20);
  assert.equal(chooseReusableCwsTab(30, [{ id: 30, url: 'https://example.com/' }]), null);
  assert.equal(chooseReusableCwsTab(null, []), null);
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/status-model.test.js`

Expected: FAIL because `chooseReusableCwsTab` is undefined.

- [ ] **Step 3: Implement the pure selector**

Add `chooseReusableCwsTab` to `status-model.js`. Filter to URLs beginning with `https://ut-ppsweb.adm.u-tokyo.ac.jp/`, return the matching tracked ID first, otherwise sort by numeric `lastAccessed` descending and return the first tab, otherwise return `null`. Export the helper.

- [ ] **Step 4: Track the background-owned tab lifecycle**

In `background.js`, define `AUTOMATION_TAB_KEY = 'hrAutomationTabId'`. Immediately after `chrome.tabs.create`, store `{ [AUTOMATION_TAB_KEY]: tab.id }` in `chrome.storage.session`. In `finally`, remove the key only when its stored value still equals this run's `tabId`, then close the owned tab as currently implemented.

- [ ] **Step 5: Replace the side-panel button behavior**

In the `btnOpenSystem` handler in `popup.js`:

```js
const tracked = (await chrome.storage.session.get('hrAutomationTabId')).hrAutomationTabId;
const tabs = await chrome.tabs.query({ url: 'https://ut-ppsweb.adm.u-tokyo.ac.jp/*' });
const reusable = globalThis.HRStatusModel.chooseReusableCwsTab(tracked, tabs);
if (reusable) {
  await chrome.tabs.update(reusable.id, { active: true });
  if (Number.isInteger(reusable.windowId)) {
    await chrome.windows.update(reusable.windowId, { focused: true });
  }
  return;
}
await chrome.tabs.create({ url: CWS_MAIN_URL, active: true });
```

Do not call `chrome.tabs.update` with a replacement URL.

- [ ] **Step 6: Run focused and syntax tests**

Run: `node --test tests/status-model.test.js && node --check status-model.js && node --check background.js && node --check popup.js`

Expected: all pass.

- [ ] **Step 7: Commit the tab behavior**

```bash
git add status-model.js background.js popup.js tests/status-model.test.js
git commit -m "fix: reuse active CWS automation tab"
```

---

### Task 2: Record verified time-entry completion in recent history

**Files:**
- Modify: `term-hours-model.js`
- Modify: `content.js`
- Modify: `tests/term-hours-model.test.js`

**Interfaces:**
- Produces: `completedHoursMessage(monthKey, workdayCount) -> string` from `term-hours-model.js`.
- Consumes: the full scheduled `workdays` array already used by `submit-check-hours`.
- Emits: history event `{ type: 'hours-complete', state: 'hours-complete', message }` only from `res.complete && sub.entryOnly`.

- [ ] **Step 1: Write the failing completion-copy test**

```js
test('describes a fully verified month in recent history', () => {
  assert.equal(
    completedHoursMessage('2026-08', 20),
    '2026年8月分：勤務時間の入力完了（20勤務日）。出勤・退勤・勤務外時間数を確認済み。'
  );
});
```

Also assert invalid counts are normalized to `0勤務日` rather than producing `NaN`.

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/term-hours-model.test.js`

Expected: FAIL because `completedHoursMessage` is undefined.

- [ ] **Step 3: Implement and export the message helper**

Format `YYYY-MM` as `YYYY年M月分`, normalize `workdayCount` to a non-negative integer, and return the exact approved Japanese copy. Keep this helper dependency-free and export it beside `planMissingEntries`.

- [ ] **Step 4: Use the helper only after live completion**

In `content.js`, replace the generic `res.complete && sub.entryOnly` message with:

```js
const message = hoursModel.completedHoursMessage(sub.targetMonth, workdays.length);
emitTermHistoryEvent(sub.targetMonth, 'hours-complete', 'hours-complete', message);
return sendTerminalSubmitDone(message);
```

Do not emit from the task-submission success page, timeout path, or partial-entry path.

- [ ] **Step 5: Run focused and syntax tests**

Run: `node --test tests/term-hours-model.test.js && node --check term-hours-model.js && node --check content.js`

Expected: all pass.

- [ ] **Step 6: Commit the completion-history behavior**

```bash
git add term-hours-model.js content.js tests/term-hours-model.test.js
git commit -m "feat: log verified monthly time completion"
```

---

### Task 3: Release, synchronize, and live-verify version 2.4.10

**Files:**
- Modify: `manifest.json`
- Verify: `popup.html`
- Verify: `tests/popup-layout.test.js`

**Interfaces:**
- Produces: unpacked extension manifest version `2.4.10` in both `main` and `.worktrees/status-history-repair`.

- [ ] **Step 1: Bump and validate the manifest**

Change `manifest.json` from `2.4.9` to `2.4.10`.

Run: `node -e 'const m=JSON.parse(require("fs").readFileSync("manifest.json","utf8")); if(m.version!=="2.4.10") process.exit(1)'`

Expected: exit 0.

- [ ] **Step 2: Run the complete automated verification**

Run:

```bash
node --test tests/*.test.js
for f in *.js tests/*.js; do node --check "$f" || exit 1; done
git diff --check
```

Expected: all tests and syntax checks pass; no whitespace errors. The popup layout test confirms 「最近の履歴」 remains after the live progress area.

- [ ] **Step 3: Commit the release version**

```bash
git add manifest.json
git commit -m "chore: bump extension version to 2.4.10"
```

- [ ] **Step 4: Synchronize the installed worktree**

Run from `.worktrees/status-history-repair`:

```bash
git merge --ff-only main
```

Expected: the worktree advances to the same 2.4.10 commit as `main`.

- [ ] **Step 5: Reload and confirm the exact installed version**

After the user clicks Reload in `chrome://extensions`, read Profile 2's `Secure Preferences` entry for extension ID `ienkkohdocdnaegcbcnehfdocabhhbmn` and confirm `service_worker_registration_info.version` is `2.4.10`.

- [ ] **Step 6: Live-verify tab reuse during automation**

Observe the CWS tab set, allow current-month automation to start, press 「就労管理システムを開く」, and confirm the tracked tab becomes active without the CWS tab count increasing. Do not navigate or submit 月次申請.

- [ ] **Step 7: Live-verify all August rows and history**

Monitor until the automatic loop finishes. Open the August 勤務表 read-only and confirm every `mg_normal` scheduled date has the required 出勤, 退勤, and 勤務外時間数 values, except verified full-day leave. Confirm 「最近の履歴」 contains the exact verified completion message with the full scheduled-workday count.

- [ ] **Step 8: Final repository verification**

Run: `git status --short && git log -4 --oneline --decorate`

Expected: both worktrees are clean and point to the release commit.
