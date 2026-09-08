# Release readiness

Hibi is ready for local development and production-style manual testing. A distributable macOS release additionally requires an Apple Developer identity and notarization credentials owned by the release operator; those credentials must never be committed or placed in a workspace backup.

Before a release:

1. Run `npm run audit` on a clean checkout.
2. Complete every scenario in `docs/notch-manual-test-plan.md` on the actual hardware matrix and attach the evidence to the release record.
3. Build and sign with a Developer ID Application certificate using hardened runtime entitlements appropriate to the Electron runtime.
4. Submit the signed artifact to Apple notarization, staple the accepted ticket, then verify the final artifact with Gatekeeper on a clean macOS account.
5. Confirm the backup restore flow with a copy of a real, non-sensitive workspace and test VoiceOver through the primary navigation, command palette, forms, modal dialogs, calendar controls, and notch confirmation.

The application uses local storage for workspace data and Keychain for the AI API key. Workspace backups deliberately omit Keychain data and never overwrite it on restore.
