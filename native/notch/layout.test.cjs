const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('uses the reference compact notch proportions for the native panel', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/notch.mm'), 'utf8');

  assert.match(source, /constexpr CGFloat kHostWidth = 256\.0/);
  assert.match(source, /constexpr CGFloat kPassiveHeight = 38\.0/);
  assert.match(source, /constexpr CGFloat kInteractiveHeight = 190\.0/);
});
