import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const required = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
const missing = required.filter((name) => !process.env[name]);
const signingIdentity = process.env.CSC_LINK || process.env.CSC_NAME;
const entitlements = resolve('electron/entitlements.mac.plist');

if (process.platform !== 'darwin') throw new Error('macOS is required to build and notarize the Hibi release.');
if (!existsSync(entitlements)) throw new Error('Missing macOS hardened-runtime entitlements.');
if (!signingIdentity) throw new Error('Set CSC_LINK or CSC_NAME for a Developer ID Application signing identity.');
if (missing.length) throw new Error(`Missing notarization environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);

console.log('Release preflight passed. Signing and notarization credentials are present.');
