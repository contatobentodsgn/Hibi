import { describe, expect, it } from 'vitest';
import { buildSupportDiagnostics } from '../support-diagnostics';

describe('support diagnostics privacy boundary', () => {
  it('exports only allowlisted runtime status and excludes private workspace/provider details', () => {
    const privateTitle = 'SECRET conversation title / note title / task title';
    const snapshot = buildSupportDiagnostics({
      exportedAt: '2026-09-25T12:00:00.000Z',
      application: { name: 'Pixano', version: '1.2.3', localOnly: true },
      platform: 'darwin',
      model: { status: 'ready', modelId: 'qwen3', sizeBytes: 1024, error: `/Users/bento/${privateTitle}` },
      microphone: { permission: 'granted', voiceAvailable: true, error: privateTitle },
      integrations: [{ id: 'notion', label: 'Notion', state: 'error', hasCredential: true, error: privateTitle, lastSyncAt: privateTitle }],
      workspace: { conversations: [privateTitle], notes: [privateTitle], tasks: [{ title: privateTitle }] },
      apiKey: 'secret-key',
    } as never);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(privateTitle);
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('/Users/bento');
    expect(snapshot).toEqual({
      schemaVersion: 1,
      exportedAt: '2026-09-25T12:00:00.000Z',
      app: { name: 'Pixano', version: '1.2.3', localOnly: true },
      runtime: { platform: 'darwin' },
      model: { status: 'ready', modelId: 'qwen3', sizeBytes: 1024 },
      microphone: { permission: 'granted', voiceAvailable: true },
      integrations: [{ id: 'notion', label: 'Notion', state: 'error', hasCredential: true }],
    });
  });

  it('normalizes unknown and missing status instead of copying arbitrary error strings', () => {
    const snapshot = buildSupportDiagnostics({
      exportedAt: 'bad date', application: { name: 'X', version: '', localOnly: false }, platform: 'unknown',
      model: { status: 'custom status with personal data', modelId: null, error: 'private path' },
      microphone: { permission: 'unknown permission text', voiceAvailable: false, error: 'private error' },
      integrations: [{ id: 'custom user connector', label: 'Private Label', state: 'broken', hasCredential: false }],
    } as never);
    expect(JSON.stringify(snapshot)).not.toContain('private');
    expect(snapshot.model.status).toBe('unknown');
    expect(snapshot.microphone.permission).toBe('unknown');
    expect(snapshot.integrations).toEqual([]);
    expect(snapshot.runtime.platform).toBe('unknown');
  });
});
