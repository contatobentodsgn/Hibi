import { describe, expect, it } from 'vitest';
import { buildDeviceSettingsPackage, DEVICE_SETTINGS_SCHEMA, DEVICE_SETTINGS_VERSION } from '../../../electron/device-settings.mjs';
import { DEFAULT_FOCUS_SETTINGS } from '../../ui/focus-settings';
import { getCurrentAdapterStatuses } from '../adapter-status';

// O timeout de tela é do aparelho: este Mac não tem tela do Taby para apagar. O ajuste só existe como
// este pacote, que o adaptador do dispositivo vai consumir — nada nele pode fingir comportamento.
describe('pacote de ajustes do dispositivo', () => {
  it('leva o timeout de tela escolhido e o loop que a tela do Taby toca', () => {
    expect(buildDeviceSettingsPackage({ ...DEFAULT_FOCUS_SETTINGS, screenTimeoutSeconds: 300, focusLoopAnimation: 'music' })).toEqual({
      schema: DEVICE_SETTINGS_SCHEMA,
      version: DEVICE_SETTINGS_VERSION,
      screenTimeoutSeconds: 300,
      focusLoopAnimation: 'music',
      focusLoopAnimationId: 'listening_music_loop',
    });
  });

  it('leva o valor saneado: um timeout fora da lista chega ao aparelho como o padrão', () => {
    expect(buildDeviceSettingsPackage({ screenTimeoutSeconds: 7 }).screenTimeoutSeconds).toBe(60);
    expect(buildDeviceSettingsPackage({ screenTimeoutSeconds: '300' }).screenTimeoutSeconds).toBe(60);
    expect(buildDeviceSettingsPackage(undefined).screenTimeoutSeconds).toBe(DEFAULT_FOCUS_SETTINGS.screenTimeoutSeconds);
  });

  it('não carrega o que é do Mac: inatividade e ausência ficam de fora', () => {
    const payload = buildDeviceSettingsPackage({ ...DEFAULT_FOCUS_SETTINGS, idleMinutes: 1, awayBehavior: 'pause' });
    expect(Object.keys(payload).sort()).toEqual(['focusLoopAnimation', 'focusLoopAnimationId', 'schema', 'screenTimeoutSeconds', 'version']);
  });

  it('é puro: mesma entrada, mesma saída, e o objeto de entrada não muda', () => {
    const settings = { ...DEFAULT_FOCUS_SETTINGS, screenTimeoutSeconds: 120 };
    const frozen = Object.freeze({ ...settings });
    expect(buildDeviceSettingsPackage(frozen)).toEqual(buildDeviceSettingsPackage(settings));
    expect(frozen).toEqual(settings);
  });

  it('existir o pacote não liga o hardware: o adaptador continua indisponível', () => {
    expect(getCurrentAdapterStatuses().find((adapter) => adapter.id === 'hardware')?.status).toBe('unavailable');
  });
});
