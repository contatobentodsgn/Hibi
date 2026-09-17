import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const usageKeys = ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription'];

/**
 * macOS blames the responsible process for a microphone or speech prompt, and the helper's
 * responsible process is Hibi.app. Without these strings in the app's own Info.plist the
 * helper is killed the moment it asks, with no dialog and nothing on screen to explain it.
 */
test('the app bundle explains why it wants the microphone and speech recognition', () => {
  const extendInfo = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).build?.mac?.extendInfo ?? {};
  for (const key of usageKeys) assert.equal(typeof extendInfo[key], 'string', `${key} is missing from build.mac.extendInfo`);
  for (const key of usageKeys) assert.ok(extendInfo[key].trim().length > 10, `${key} needs a sentence a person can read`);
});

test('the voice helper carries the same two purposes, since it is the process that opens the input', () => {
  const plist = readFileSync(`${root}native/voice/hibi-voice.plist`, 'utf8');
  for (const key of usageKeys) assert.ok(plist.includes(`<key>${key}</key>`), `${key} is missing from the helper Info.plist`);
});
