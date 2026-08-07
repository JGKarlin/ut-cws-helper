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

test('does not click 就労メインページ when the workday menu is unavailable', () => {
  assert.equal(
    chooseWorkdayNavigationAction(['就労メインページ', '勤務表', '就労申請'], false),
    'work-menu-unavailable'
  );
});
