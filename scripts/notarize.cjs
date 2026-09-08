exports.default = async function notarize(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const required = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
  if (required.some((name) => !process.env[name])) throw new Error('Notarization credentials are required for a macOS release build.');
  const { notarize } = require('@electron/notarize');
  await notarize({ appBundleId: 'com.hibi.study', appPath: `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`, appleId: process.env.APPLE_ID, appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD, teamId: process.env.APPLE_TEAM_ID });
};
