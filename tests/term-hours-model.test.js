const test = require('node:test');
const assert = require('node:assert/strict');

let isFullDayPaidLeave, findMissingWorkdays, findScheduledWorkdays;
try {
  ({ isFullDayPaidLeave, findMissingWorkdays, findScheduledWorkdays } = require('../term-hours-model.js'));
} catch (_) {}

test('excludes full-day paid leave from missing work time', () => {
  assert.equal(typeof findMissingWorkdays, 'function');
  const missing = findMissingWorkdays(
    ['2026-07-10'],
    [{ day: 10, hasArrival: false, hasDeparture: false, rowText: '7/10 金 年休（日） 年次有給休暇 全日' }]
  );
  assert.deepEqual(missing, []);
});

test('recognizes compact and full-width full-day paid-leave text', () => {
  assert.equal(typeof isFullDayPaidLeave, 'function');
  assert.equal(isFullDayPaidLeave('7/10（金）　年休（日）／年次有給休暇／全日'), true);
  assert.equal(isFullDayPaidLeave('7/10(金)年休（日）年次有給休暇全日'), true);
});

test('keeps a normal blank weekday missing', () => {
  assert.deepEqual(
    findMissingWorkdays(['2026-07-09'], [{ day: 9, hasArrival: false, hasDeparture: false, rowText: '7/9 木' }]),
    ['2026-07-09']
  );
});

test('does not classify partial-day leave as full-day paid leave', () => {
  assert.equal(isFullDayPaidLeave('年休（時間） 2時間'), false);
  assert.deepEqual(
    findMissingWorkdays(['2026-07-11'], [{ day: 11, hasArrival: false, hasDeparture: false, rowText: '7/11 土 年休（時間） 2時間' }]),
    ['2026-07-11']
  );
});

test('keeps an absent row missing', () => {
  assert.deepEqual(findMissingWorkdays(['2026-07-12'], []), ['2026-07-12']);
});

test('keeps a row with only one clock field missing', () => {
  assert.deepEqual(
    findMissingWorkdays(['2026-07-13'], [{ day: 13, hasArrival: true, hasDeparture: false, rowText: '7/13 月 9時00分' }]),
    ['2026-07-13']
  );
});

test('does not skip unrelated text that happens to contain 全日', () => {
  assert.equal(isFullDayPaidLeave('7/14 火 特記事項：全日対応'), false);
  assert.deepEqual(
    findMissingWorkdays(['2026-07-14'], [{ day: 14, hasArrival: false, hasDeparture: false, rowText: '7/14 火 特記事項：全日対応' }]),
    ['2026-07-14']
  );
});

test('excludes duplicate July 10 rows when full-day leave appears first or last', () => {
  const leave = { day: 10, hasArrival: false, hasDeparture: false, rowText: '7/10 金 年休（日） 年次有給休暇 全日' };
  const blank = { day: 10, hasArrival: false, hasDeparture: false, rowText: '7/10 金' };
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [leave, blank]), []);
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [blank, leave]), []);
});

test('treats any complete duplicate as date-level completion without leave', () => {
  const complete = { day: 10, hasArrival: true, hasDeparture: true, rowText: '7/10 金 9時00分 18時00分' };
  const blank = { day: 10, hasArrival: false, hasDeparture: false, rowText: '7/10 金' };
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [complete, blank]), []);
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [blank, complete]), []);
});

test('keeps a partial and blank duplicate missing without leave', () => {
  const partial = { day: 10, hasArrival: true, hasDeparture: false, rowText: '7/10 金 9時00分' };
  const blank = { day: 10, hasArrival: false, hasDeparture: false, rowText: '7/10 金' };
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [partial, blank]), ['2026-07-10']);
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [blank, partial]), ['2026-07-10']);
});

test('derives scheduled dates from live 勤務表 day classes', () => {
  assert.equal(typeof findScheduledWorkdays, 'function');
  assert.deepEqual(
    findScheduledWorkdays('2026-07', [
      { day: 3, dayClass: 'mg_normal' },
      { day: 4, dayClass: 'mg_dh_sat' },
      { day: 5, dayClass: 'mg_dh_sun' },
      { day: 20, dayClass: 'mg_dh_holiday' },
      { day: 21, dayClass: 'mg_normal' }
    ]),
    ['2026-07-03', '2026-07-21']
  );
});

test('includes the entire current month when run before month end', () => {
  assert.deepEqual(
    findScheduledWorkdays('2026-08', [
      { day: 3, dayClass: 'mg_normal' },
      { day: 7, dayClass: 'mg_normal' },
      { day: 10, dayClass: 'mg_dh_holiday' },
      { day: 11, dayClass: 'mg_normal' }
    ]),
    ['2026-08-03', '2026-08-07', '2026-08-11']
  );
});

test('fails closed on unknown day classes', () => {
  assert.deepEqual(
    findScheduledWorkdays('2026-08', [
      { day: 3, dayClass: '' },
      { day: 4, dayClass: 'new_unknown_class' },
      { day: 5, dayClass: 'mg_normal extra' }
    ]),
    ['2026-08-05']
  );
});

test('fails closed on impossible calendar dates', () => {
  assert.deepEqual(
    findScheduledWorkdays('2026-02', [
      { day: 28, dayClass: 'mg_normal' },
      { day: 29, dayClass: 'mg_normal' },
      { day: 31, dayClass: 'mg_normal' }
    ]),
    ['2026-02-28']
  );
  assert.deepEqual(findScheduledWorkdays('2026-13', [{ day: 1, dayClass: 'mg_normal' }]), []);
});
