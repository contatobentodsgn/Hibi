import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'native/voice/build/hibi-voice');
mkdirSync(dirname(output), { recursive: true });
execFileSync('swiftc', ['-parse-as-library', resolve(root, 'native/voice/hibi-voice.swift'), '-o', output, '-framework', 'Speech', '-framework', 'AVFoundation'], { stdio: 'inherit' });
