const test = require('node:test');
const assert = require('node:assert/strict');

let isFullDayPaidLeave, findMissingWorkdays;
try {
  ({ isFullDayPaidLeave, findMissingWorkdays } = require('../term-hours-model.js'));
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

test('does not let a blank duplicate falsely complete a day without leave', () => {
  const complete = { day: 10, hasArrival: true, hasDeparture: true, rowText: '7/10 金 9時00分 18時00分' };
  const blank = { day: 10, hasArrival: false, hasDeparture: false, rowText: '7/10 金' };
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [complete, blank]), ['2026-07-10']);
  assert.deepEqual(findMissingWorkdays(['2026-07-10'], [blank, complete]), ['2026-07-10']);
});
