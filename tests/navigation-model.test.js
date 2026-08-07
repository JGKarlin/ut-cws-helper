const test = require('node:test');
const assert = require('node:assert/strict');
let chooseWorkdayNavigationAction, matchesApplicationLink;
try { ({ chooseWorkdayNavigationAction, matchesApplicationLink } = require('../navigation-model.js')); } catch (_) {}

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

test('does not click 就労メインページ when the workday menu is unavailable', () => {
  assert.equal(
    chooseWorkdayNavigationAction(['就労メインページ', '勤務表', '就労申請'], false),
    'work-menu-unavailable'
  );
});

test('matches the live ◆-prefixed attendance-entry links', () => {
  assert.equal(matchesApplicationLink('clockin', '◆自己申告記録（出勤）', 'root.cws.shuro.application.srw_app_gi02'), true);
  assert.equal(matchesApplicationLink('clockout', '◆自己申告記録（退勤）', 'root.cws.shuro.application.srw_app_gi03'), true);
  assert.equal(matchesApplicationLink('break', '◆勤務外時間数', 'root.cws.shuro.application.srw_app_gi07'), true);
});

test('does not mistake cancellation links for entry links', () => {
  assert.equal(matchesApplicationLink('clockin', '自己申告記録取消', 'root.cws.shuro.application.srw_app_gi_cancel02'), false);
  assert.equal(matchesApplicationLink('break', '勤務外時間数取消', 'root.cws.shuro.application.srw_app_gi_cancel02'), false);
});
