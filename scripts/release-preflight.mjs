import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const required = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
const missing = required.filter((name) => !process.env[name]);
const installedIdentity = process.platform === 'darwin' ? execFileSync('security', ['find-identity', '-p', 'codesigning', '-v'], { encoding: 'utf8' }) : '';
const signingIdentity = process.env.CSC_LINK || process.env.CSC_NAME || (/Developer ID Application:/i.test(installedIdentity) ? 'installed Developer ID Application identity' : '');
const entitlements = resolve('electron/entitlements.mac.plist');

if (process.platform !== 'darwin') throw new Error('macOS is required to build and notarize the Hibi release.');
if (!existsSync(entitlements)) throw new Error('Missing macOS hardened-runtime entitlements.');
if (!signingIdentity) throw new Error('Install a Developer ID Application identity or set CSC_LINK/CSC_NAME.');
if (missing.length) throw new Error(`Missing notarization environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);

console.log('Release preflight passed. Signing and notarization credentials are present.');
