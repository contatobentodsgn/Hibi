// O pacote de ajustes destinado ao dispositivo físico Taby.
//
// POR QUE UM CONTRATO, E NÃO UM CONTROLE QUE "FUNCIONA"
// O timeout de tela é ajuste de hardware: no original ele só existe dentro do SDK do aparelho, que é
// quem controla brilho e tela. Este Mac não tem tela do Taby para apagar. Fingir o comportamento seria
// repetir o defeito que a auditoria achou — controles que não governam nada. Então o valor é salvo,
// entra no backup e sai daqui num pacote puro e versionado, que é exatamente o que o adaptador do Taby
// vai consumir quando existir. Até lá o adaptador `hardware` continua `unavailable`
// (`src/domain/adapter-status.ts`), e a aba Foco diz que o ajuste só vale com o Taby conectado.
//
// O QUE ENTRA
// Só o que é do aparelho: o timeout da tela e o loop que a tela dele toca durante o foco. Inatividade e
// comportamento de ausência são do Mac — o monitor de presença mora no processo principal — e ficam fora.

import { sanitizeFocusSettings } from './focus-gate.mjs';
import { resolveFocusLoopAnimationId } from './focus-presence.mjs';

export const DEVICE_SETTINGS_SCHEMA = 'hibi.device-settings';
export const DEVICE_SETTINGS_VERSION = 1;

/** Puro: sempre sai de `sanitizeFocusSettings`, então um valor corrompido chega ao aparelho como o padrão. */
export function buildDeviceSettingsPackage(settings) {
  const safe = sanitizeFocusSettings(settings);
  return {
    schema: DEVICE_SETTINGS_SCHEMA,
    version: DEVICE_SETTINGS_VERSION,
    screenTimeoutSeconds: safe.screenTimeoutSeconds,
    focusLoopAnimation: safe.focusLoopAnimation,
    focusLoopAnimationId: resolveFocusLoopAnimationId(safe.focusLoopAnimation),
  };
}
