# Live provider verification

The automated suite never sends traffic to an external AI provider. The optional
live check requires every value below at invocation time:

```sh
HIBI_LIVE_PROVIDER_TEST=1 \
HIBI_LIVE_PROVIDER_ENDPOINT=https://sandbox.example.com/v1/chat/completions \
HIBI_LIVE_PROVIDER_MODEL=your-sandbox-model \
HIBI_LIVE_PROVIDER_KEY=your-temporary-sandbox-key \
HIBI_LIVE_PROVIDER_ALLOW_HOSTS=sandbox.example.com \
npm run test:providers:live
```

It refuses non-HTTPS endpoints and hosts outside the exact comma-separated
allowlist. The report includes only endpoint host, reported model, provider,
stream event types and normalized usage. It never prints the key, request body,
or provider response body.

Use a temporary sandbox credential. The command makes a single harmless JSON
contract request; it does not run local tools or create workspace data.
