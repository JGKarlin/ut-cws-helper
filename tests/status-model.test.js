const test = require('node:test');
const assert = require('node:assert/strict');

let buildMonthRows, statusEventsFromSnapshot, appendHistoryEvent, classifyBackgroundOutcome;
try {
  ({ buildMonthRows, statusEventsFromSnapshot, appendHistoryEvent, classifyBackgroundOutcome } = require('../status-model.js'));
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
