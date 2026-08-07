const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('places recent history after the controls and live progress area', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
  const history = html.indexOf('id="termHistory"');
  const progress = html.indexOf('id="progressBar"');
  const automationEnd = html.indexOf('</div>', progress);

  assert.notEqual(history, -1);
  assert.notEqual(progress, -1);
  assert.ok(history > progress);
  assert.ok(history > automationEnd);
});
