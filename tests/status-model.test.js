const test = require('node:test');
const assert = require('node:assert/strict');

let buildMonthRows, statusEventsFromSnapshot, appendHistoryEvent, markMonthsStale, classifyBackgroundOutcome;
try {
  ({ buildMonthRows, statusEventsFromSnapshot, appendHistoryEvent, markMonthsStale, classifyBackgroundOutcome } = require('../status-model.js'));
} catch (_) {}

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

test('newer live approval outranks stale persisted action state', () => {
  const rows = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'approved', submitted: true, submittable: false },
      '2026-07': { month: '2026-07', approval: 'approved', submitted: true, submittable: false }
    },
    pending: { targetMonth: '2026-07', prevMonth: '2026-06' },
    activeRun: { month: '2026-07', state: 'processing' },
    userAction: { month: '2026-07', message: '古い失敗' },
    autoSubmitEnabled: true
  });
  const july = rows.find(row => row.month === '2026-07');
  assert.equal(july.state, 'approved');
  assert.equal(july.actionMonth, undefined);
});

test('drops future history events outside the current 12-month window', () => {
  const retained = appendHistoryEvent(
    [{ id: '2026-08:approved:approved', month: '2026-08', type: 'approved', state: 'approved', at: 1 }],
    { month: '2026-09', type: 'submitted', state: 'submitted-pending', at: 2 },
    '2026-08'
  );
  assert.equal(retained.some(event => event.month === '2026-09'), false);
  assert.equal(retained.some(event => event.month === '2026-08'), true);
});

test('provides explicit Japanese copy for submitted June and waiting July', () => {
  const rows = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'pending', submitted: true, submittable: false },
      '2026-07': { month: '2026-07', approval: 'none', submittable: true }
    },
    pending: { targetMonth: '2026-07', prevMonth: '2026-06' },
    autoSubmitEnabled: true
  });

  assert.equal(rows.find(row => row.month === '2026-06').message, '2026年6月分：提出済み（承認待ち）');
  assert.match(rows.find(row => row.month === '2026-07').message, /2026年6月分の承認待ち/);
});

test('uses a fresh CWS-ready month instead of stale persisted action state', () => {
  const rows = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'approved', submitted: true, submittable: false, fresh: true },
      '2026-07': { month: '2026-07', approval: 'none', submittable: true, fresh: true }
    },
    pending: { targetMonth: '2026-07', prevMonth: '2026-06' },
    userAction: { month: '2026-07', message: '古い失敗' },
    autoSubmitEnabled: true
  });

  const july = rows.find(row => row.month === '2026-07');
  assert.equal(july.state, 'ready-auto');
  assert.equal(july.message, '2026年7月分：自動申請の準備ができました。');
});

test('treats the actual pending CWS scan shape as submitted and awaiting approval', () => {
  const rows = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'pending', submittable: false, fresh: true }
    },
    autoSubmitEnabled: true
  });

  const june = rows.find(row => row.month === '2026-06');
  assert.equal(june.state, 'submitted-pending');
  assert.equal(june.message, '2026年6月分：提出済み（承認待ち）');
});

test('holds a fresh July until its fresh June dependency is finally approved', () => {
  const waiting = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'pending', submittable: false, fresh: true },
      '2026-07': { month: '2026-07', approval: 'none', submittable: true, fresh: true }
    },
    pending: { targetMonth: '2026-07', prevMonth: '2026-06' },
    autoSubmitEnabled: true
  });
  assert.equal(waiting.find(row => row.month === '2026-06').state, 'submitted-pending');
  assert.equal(waiting.find(row => row.month === '2026-07').state, 'waiting-approval');

  const ready = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'approved', submittable: false, fresh: true },
      '2026-07': { month: '2026-07', approval: 'none', submittable: true, fresh: true }
    },
    pending: { targetMonth: '2026-07', prevMonth: '2026-06' },
    autoSubmitEnabled: true
  });
  assert.equal(ready.find(row => row.month === '2026-07').state, 'ready-auto');
});

test('derives the July approval gate from fresh June without persisted pending state', () => {
  const waiting = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'pending', submittable: false, fresh: true },
      '2026-07': { month: '2026-07', approval: 'none', submittable: true, fresh: true }
    },
    autoSubmitEnabled: true
  });
  assert.equal(waiting.find(row => row.month === '2026-07').state, 'waiting-approval');

  const ready = buildMonthRows({
    currentMonth: '2026-08',
    months: {
      '2026-06': { month: '2026-06', approval: 'approved', submittable: false, fresh: true },
      '2026-07': { month: '2026-07', approval: 'none', submittable: true, fresh: true }
    },
    autoSubmitEnabled: true
  });
  assert.equal(ready.find(row => row.month === '2026-07').state, 'ready-auto');
});

test('marks failed-scan rows stale before persisted action state is resolved', () => {
  assert.equal(typeof markMonthsStale, 'function');
  const rows = buildMonthRows({
    currentMonth: '2026-08',
    months: markMonthsStale({
      '2026-07': { month: '2026-07', approval: 'none', submittable: true, fresh: true }
    }),
    userAction: { month: '2026-07', message: '確認が必要です。' },
    autoSubmitEnabled: true
  });

  const july = rows.find(row => row.month === '2026-07');
  assert.equal(july.stale, true);
  assert.equal(july.fresh, false);
  assert.equal(july.state, 'user-action-required');
});

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
