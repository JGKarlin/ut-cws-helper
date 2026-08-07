const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const background = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

test('records entry-only timeouts and infrastructure failures in recent history', () => {
  assert.match(background, /if \(tracksMonthlySubmission \|\| progress\?\.timeout \|\| progress\?\.error\)/);
  assert.match(background, /勤務時間の自動入力が時間内に完了しませんでした/);
  assert.match(background, /勤務時間の自動入力中にエラーが発生しました/);
});

test('waits for completion history persistence before declaring the month done', () => {
  assert.match(content, /async function emitTermHistoryEvent/);
  assert.match(content, /await emitTermHistoryEvent\(sub\.targetMonth, 'hours-complete', 'hours-complete', message\)/);
  assert.match(content, /勤務時間の完了履歴を保存できませんでした/);
});
