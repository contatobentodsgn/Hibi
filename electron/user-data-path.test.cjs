const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveUserDataPath, APP_FOLDER, LEGACY_FOLDER } = require('./user-data-path.cjs');

function appDataWith(folders) {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-user-data-'));
  for (const [folder, content] of Object.entries(folders)) {
    fs.mkdirSync(path.join(appData, folder), { recursive: true });
    fs.writeFileSync(path.join(appData, folder, 'marca.txt'), content);
  }
  return appData;
}

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const touch = (dir, when) => fs.utimesSync(dir, when, when);

test('a fresh install goes straight to the named folder', () => {
  const appData = appDataWith({});
  const notices = [];
  assert.equal(resolveUserDataPath({ appData, onNotice: (notice) => notices.push(notice) }), path.join(appData, APP_FOLDER));
  assert.deepEqual(notices, []);
});

test('the old folder is moved into place, with every file intact', () => {
  const appData = appDataWith({ [LEGACY_FOLDER]: 'trabalho da pessoa' });
  const notices = [];

  const resolved = resolveUserDataPath({ appData, onNotice: (notice) => notices.push(notice) });

  assert.equal(resolved, path.join(appData, APP_FOLDER));
  assert.equal(read(path.join(resolved, 'marca.txt')), 'trabalho da pessoa');
  assert.equal(fs.existsSync(path.join(appData, LEGACY_FOLDER)), false);
  assert.deepEqual(notices.map((notice) => notice.kind), ['migrated']);
});

test('a stale folder with the new name is renamed aside instead of overwritten', () => {
  const appData = appDataWith({ [APP_FOLDER]: 'build antigo', [LEGACY_FOLDER]: 'trabalho de hoje' });
  touch(path.join(appData, APP_FOLDER), new Date('2026-09-01T00:00:00Z'));
  touch(path.join(appData, LEGACY_FOLDER), new Date('2026-09-17T00:00:00Z'));
  const notices = [];

  const resolved = resolveUserDataPath({ appData, now: () => new Date('2026-09-17T12:00:00Z'), onNotice: (notice) => notices.push(notice) });

  assert.equal(resolved, path.join(appData, APP_FOLDER));
  assert.equal(read(path.join(resolved, 'marca.txt')), 'trabalho de hoje');
  const aside = fs.readdirSync(appData).find((entry) => entry.startsWith(`${APP_FOLDER}.superseded-`));
  assert.equal(read(path.join(appData, String(aside), 'marca.txt')), 'build antigo', 'the older folder must survive under another name');
  assert.deepEqual(notices.map((notice) => notice.kind), ['superseded', 'migrated']);
});

test('a newer folder with the new name wins, and the old one is left where it is', () => {
  const appData = appDataWith({ [APP_FOLDER]: 'trabalho de hoje', [LEGACY_FOLDER]: 'abandonado' });
  touch(path.join(appData, APP_FOLDER), new Date('2026-09-17T00:00:00Z'));
  touch(path.join(appData, LEGACY_FOLDER), new Date('2026-09-01T00:00:00Z'));

  const resolved = resolveUserDataPath({ appData });

  assert.equal(read(path.join(resolved, 'marca.txt')), 'trabalho de hoje');
  assert.equal(read(path.join(appData, LEGACY_FOLDER, 'marca.txt')), 'abandonado');
});

test('a move that fails keeps the app on the folder it already had', () => {
  const appData = appDataWith({ [LEGACY_FOLDER]: 'trabalho da pessoa' });
  const notices = [];
  const failing = { ...fs, renameSync: () => { throw new Error('read-only volume'); } };

  const resolved = resolveUserDataPath({ appData, fs: failing, onNotice: (notice) => notices.push(notice) });

  assert.equal(resolved, path.join(appData, LEGACY_FOLDER));
  assert.equal(read(path.join(resolved, 'marca.txt')), 'trabalho da pessoa');
  assert.equal(notices[0]?.kind, 'failed');
});
