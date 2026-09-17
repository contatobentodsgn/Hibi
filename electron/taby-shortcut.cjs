const { normalizeAccelerator } = require('./shortcut-settings.cjs');

/**
 * O atalho global que chama o Taby.
 *
 * Dois estados que a tela precisa distinguir, e por isso não são exceção:
 * `disabled`, quem desligou de propósito, e `taken`, quando outro app já ficou com a tecla — aí o
 * atalho escolhido continua salvo, para a pessoa ver qual é e trocar, em vez de sumir sem explicação.
 */
function createTabyShortcut({ globalShortcut, settings, onTrigger }) {
  if (!globalShortcut || !settings || typeof onTrigger !== 'function') throw new Error('A global shortcut manager needs Electron, settings and a handler.');
  let registered = null;
  let status = 'disabled';

  const release = () => {
    if (registered) globalShortcut.unregister(registered);
    registered = null;
  };

  const apply = () => {
    const { accelerator } = settings.get();
    release();
    if (!accelerator) {
      status = 'disabled';
      return describe();
    }
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, onTrigger) !== false;
      // Um `register` que devolve `true` sem prender a tecla existiria só como mentira: a
      // confirmação vem do próprio Electron.
      if (ok && typeof globalShortcut.isRegistered === 'function') ok = globalShortcut.isRegistered(accelerator);
    } catch {
      ok = false;
    }
    if (!ok) {
      release();
      status = 'taken';
      return describe();
    }
    registered = accelerator;
    status = 'active';
    return describe();
  };

  function describe() {
    return { accelerator: settings.get().accelerator, status };
  }

  return {
    apply,
    describe,
    set(accelerator) {
      settings.save({ accelerator: normalizeAccelerator(accelerator) });
      return apply();
    },
    dispose() {
      release();
      status = 'disabled';
    },
  };
}

module.exports = { createTabyShortcut };
