import { useState } from 'react';
import { Button, Input, Label, Popover, TextField } from '@heroui/react';
import { UNSAFE_PortalProvider } from 'react-aria';

/**
 * Prova de que o HeroUI funciona no Hibi, no desenvolvimento e no app empacotado: um botão, um campo e um
 * popover, com o tema e os estilos da integração. Só abre por `?overlay=ui-probe`, que nenhuma janela do
 * app usa; a galeria de componentes da U02 a substitui.
 *
 * Os popovers são desenhados dentro do contêiner `.hibi-ui`, e não no `body`: é lá que valem as regras da
 * UI nova, sem alcançar as telas atuais.
 */
export function HeroUIProbe() {
  const [presses, setPresses] = useState(0);
  const [name, setName] = useState('');
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  return (
    <main className="hibi-ui" data-probe="heroui" style={{ display: 'grid', gap: 16, padding: 24, maxWidth: 420 }}>
      <UNSAFE_PortalProvider getContainer={() => portal ?? document.body}>
        <Button onPress={() => setPresses((value) => value + 1)}>Pressionado {presses}</Button>
        <TextField value={name} onChange={setName}>
          <Label>Nome</Label>
          <Input placeholder="Digite um nome" />
        </TextField>
        <Popover>
          <Button variant="secondary">Abrir popover</Button>
          <Popover.Content>
            <Popover.Dialog aria-label="Popover de prova">Olá, {name || 'Hibi'}</Popover.Dialog>
          </Popover.Content>
        </Popover>
      </UNSAFE_PortalProvider>
      <div ref={setPortal} data-portal="heroui" />
    </main>
  );
}
