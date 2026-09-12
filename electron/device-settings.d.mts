import type { FocusLoopAnimation, FocusLoopAnimationId } from './focus-presence.mjs';

export type DeviceSettingsPackage = Readonly<{
  schema: 'hibi.device-settings';
  version: 1;
  screenTimeoutSeconds: number;
  focusLoopAnimation: FocusLoopAnimation;
  focusLoopAnimationId: FocusLoopAnimationId;
}>;

export declare const DEVICE_SETTINGS_SCHEMA: 'hibi.device-settings';
export declare const DEVICE_SETTINGS_VERSION: 1;
export declare function buildDeviceSettingsPackage(settings: unknown): DeviceSettingsPackage;
