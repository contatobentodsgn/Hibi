import test from 'node:test'
import assert from 'node:assert/strict'
import { readLiveProviderConfig } from './test-live-providers.mjs'

test('refuses live provider traffic without explicit opt-in and a host allowlist', () => {
  assert.throws(() => readLiveProviderConfig({ HIBI_LIVE_PROVIDER_ENDPOINT: 'https://sandbox.example.test/v1/chat/completions', HIBI_LIVE_PROVIDER_MODEL: 'test', HIBI_LIVE_PROVIDER_KEY: 'secret', HIBI_LIVE_PROVIDER_ALLOW_HOSTS: 'sandbox.example.test' }), /HIBI_LIVE_PROVIDER_TEST=1/)
  assert.throws(() => readLiveProviderConfig({ HIBI_LIVE_PROVIDER_TEST: '1', HIBI_LIVE_PROVIDER_ENDPOINT: 'https://outside.example.test/v1/chat/completions', HIBI_LIVE_PROVIDER_MODEL: 'test', HIBI_LIVE_PROVIDER_KEY: 'secret', HIBI_LIVE_PROVIDER_ALLOW_HOSTS: 'sandbox.example.test' }), /allowlist/)
})

test('accepts an explicitly opted-in sandbox configuration without returning the key', () => {
  const config = readLiveProviderConfig({ HIBI_LIVE_PROVIDER_TEST: '1', HIBI_LIVE_PROVIDER_ENDPOINT: 'https://sandbox.example.test/v1/chat/completions', HIBI_LIVE_PROVIDER_MODEL: 'test', HIBI_LIVE_PROVIDER_KEY: 'secret', HIBI_LIVE_PROVIDER_ALLOW_HOSTS: 'sandbox.example.test' })

  assert.deepEqual(config, { endpoint: 'https://sandbox.example.test/v1/chat/completions', host: 'sandbox.example.test', model: 'test' })
  assert.equal(JSON.stringify(config).includes('secret'), false)
})
