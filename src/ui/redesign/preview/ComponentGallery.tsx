import { useState } from 'react';
import {
  Alert, AlertDialog, Button, Card, Checkbox, Chip, Description, Dropdown, FieldError, Input, Label, ListBox, Modal,
  Popover, ProgressBar, Radio, RadioGroup, Select, Skeleton, Spinner, Switch, Tabs, TextArea, TextField, Tooltip,
} from '@heroui/react';
import { MoreHorizontal, Plus, Settings2, Trash2 } from 'lucide-react';
import { HibiUiRoot } from '../components/HibiUiRoot';
import { useThemePreference } from '../../theme-context';
import type { ThemePreference, TintPreference } from '../../theme';

/**
 * Galeria dos controles da nova UI (U02), só no desenvolvimento (`?overlay=ui-gallery`): nunca é um destino
 * do app, e o build de produção nem a inclui. Serve para conferir tokens, estados e acabamento contra o
 * preview aprovado, nos dois temas, nos cinco tons, em pt e en e com textos longos. Os dados são fictícios e
 * genéricos, sem nada de ninguém.
 */

const COPY = {
  pt: {
    title: 'Galeria de componentes', subtitle: 'Controles da nova UI com os tokens do Hibi.',
    theme: 'Tema', system: 'Sistema', light: 'Claro', dark: 'Escuro', tint: 'Tom', language: 'Idioma', long: 'Textos longos',
    actions: 'Ações', primary: 'Salvar', secondary: 'Cancelar', tertiary: 'Mais tarde', ghost: 'Detalhes', danger: 'Excluir',
    disabled: 'Indisponível', pending: 'Salvando', add: 'Adicionar',
    fields: 'Campos', name: 'Nome da tarefa', nameHelp: 'Aparece em Hoje e na Agenda.', nameError: 'Dê um nome à tarefa.',
    notes: 'Anotações', folder: 'Pasta', choose: 'Escolha uma pasta', blocked: 'Campo bloqueado',
    choices: 'Escolhas', remind: 'Lembrar antes de começar', done: 'Marcar como feita', duration: 'Duração', min25: '25 minutos', min50: '50 minutos', min90: '90 minutos',
    cards: 'Cartões', cardTitle: 'Próximo compromisso', cardText: 'Revisão do planejamento semanal, das 15h às 16h.', open: 'Abrir',
    overlays: 'Menus e diálogos', menu: 'Mais ações', edit: 'Editar', duplicate: 'Duplicar', archive: 'Arquivar',
    popover: 'Ver resumo', popoverText: 'Três tarefas para hoje, uma atrasada.', tooltip: 'Ajustes', dialog: 'Abrir diálogo',
    dialogTitle: 'Mover tarefa', dialogText: 'A tarefa vai para amanhã às 9h.', confirm: 'Confirmar', destructive: 'Excluir tarefa',
    destructiveTitle: 'Excluir "Revisar contrato"?', destructiveText: 'Isso não pode ser desfeito.',
    states: 'Estados', success: 'Tudo salvo', successText: 'As mudanças estão neste Mac.', warning: 'Calendário desconectado',
    warningText: 'Conecte de novo em Ajustes.', failure: 'Não deu para salvar', failureText: 'Tente de novo em instantes.',
    progress: 'Progresso da meta', loading: 'Carregando', tabs: 'Visões', day: 'Dia', week: 'Semana', dayPanel: 'A visão do dia.', weekPanel: 'A visão da semana.',
    utilities: 'Utilitários da UI nova', utilitiesText: 'Classes do Tailwind valem aqui dentro, e não nas telas atuais.',
  },
  en: {
    title: 'Component gallery', subtitle: 'New UI controls with Hibi tokens.',
    theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark', tint: 'Tint', language: 'Language', long: 'Long texts',
    actions: 'Actions', primary: 'Save', secondary: 'Cancel', tertiary: 'Later', ghost: 'Details', danger: 'Delete',
    disabled: 'Unavailable', pending: 'Saving', add: 'Add',
    fields: 'Fields', name: 'Task name', nameHelp: 'Shows up in Today and in the Agenda.', nameError: 'Give the task a name.',
    notes: 'Notes', folder: 'Folder', choose: 'Choose a folder', blocked: 'Locked field',
    choices: 'Choices', remind: 'Remind me before it starts', done: 'Mark as done', duration: 'Duration', min25: '25 minutes', min50: '50 minutes', min90: '90 minutes',
    cards: 'Cards', cardTitle: 'Next event', cardText: 'Weekly planning review, from 3 to 4 pm.', open: 'Open',
    overlays: 'Menus and dialogs', menu: 'More actions', edit: 'Edit', duplicate: 'Duplicate', archive: 'Archive',
    popover: 'See summary', popoverText: 'Three tasks for today, one overdue.', tooltip: 'Settings', dialog: 'Open dialog',
    dialogTitle: 'Move task', dialogText: 'The task moves to tomorrow at 9 am.', confirm: 'Confirm', destructive: 'Delete task',
    destructiveTitle: 'Delete "Review contract"?', destructiveText: 'This cannot be undone.',
    states: 'States', success: 'All saved', successText: 'Your changes are on this Mac.', warning: 'Calendar disconnected',
    warningText: 'Reconnect it in Settings.', failure: 'Could not save', failureText: 'Try again in a moment.',
    progress: 'Goal progress', loading: 'Loading', tabs: 'Views', day: 'Day', week: 'Week', dayPanel: 'The day view.', weekPanel: 'The week view.',
    utilities: 'New UI utilities', utilitiesText: 'Tailwind classes apply in here, not in the current screens.',
  },
} as const;

const LONG = { pt: ' — com um texto bem mais comprido que o normal, para ver quebra de linha e alinhamento sem cortar nada', en: ' — with a much longer text than usual, to check line wrapping and alignment without clipping anything' } as const;
const TINTS: readonly TintPreference[] = ['aurora', 'ocean', 'moss', 'iris', 'rose'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section aria-label={title} style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 560, margin: 0 }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
}

export function ComponentGallery() {
  const { preference, setPreference, tint, setTint } = useThemePreference();
  const [language, setLanguage] = useState<'pt' | 'en'>('pt');
  const [long, setLong] = useState(false);
  const [presses, setPresses] = useState(0);
  const [name, setName] = useState('');
  const [remind, setRemind] = useState(true);
  const t = COPY[language];
  const extra = long ? LONG[language] : '';

  return (
    <HibiUiRoot data-gallery="" lang={language} style={{ minHeight: '100vh', background: 'var(--background)', padding: 32, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 28, alignContent: 'start' }}>
      <header style={{ display: 'grid', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 550, letterSpacing: '-0.04em', margin: 0 }}>{t.title}</h1>
          <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>{t.subtitle}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'end' }}>
          <RadioGroup value={preference} onChange={(value) => setPreference(value as ThemePreference)} orientation="horizontal">
            <Label>{t.theme}</Label>
            {THEMES.map((value) => <Radio key={value} value={value}><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>{t[value]}</Label></Radio.Content></Radio>)}
          </RadioGroup>
          <RadioGroup value={tint} onChange={(value) => setTint(value as TintPreference)} orientation="horizontal">
            <Label>{t.tint}</Label>
            {TINTS.map((value) => <Radio key={value} value={value}><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>{value}</Label></Radio.Content></Radio>)}
          </RadioGroup>
          <RadioGroup value={language} onChange={(value) => setLanguage(value as 'pt' | 'en')} orientation="horizontal">
            <Label>{t.language}</Label>
            <Radio value="pt"><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>pt</Label></Radio.Content></Radio>
            <Radio value="en"><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>en</Label></Radio.Content></Radio>
          </RadioGroup>
          <Switch isSelected={long} onChange={setLong}><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control><Label>{t.long}</Label></Switch.Content></Switch>
        </div>
      </header>

      <Section title={t.actions}>
        <Button variant="primary" onPress={() => setPresses((value) => value + 1)}>{t.primary} {presses}</Button>
        <Button variant="secondary">{t.secondary}</Button>
        <Button variant="tertiary">{t.tertiary}</Button>
        <Button variant="ghost">{t.ghost}{extra}</Button>
        <Button variant="danger"><Trash2 size={15} aria-hidden="true" />{t.danger}</Button>
        <Button variant="primary" isDisabled>{t.disabled}</Button>
        <Button variant="primary" isPending><Spinner size="sm" color="current" />{t.pending}</Button>
        <Button variant="secondary" size="sm"><Plus size={14} aria-hidden="true" />{t.add}</Button>
        <Button variant="secondary" size="lg">{t.add}</Button>
        <Button variant="ghost" isIconOnly aria-label={t.tooltip}><Settings2 size={16} aria-hidden="true" /></Button>
      </Section>

      <Section title={t.fields}>
        <div style={{ display: 'grid', gap: 14, width: 'min(360px, 100%)' }}>
          <TextField value={name} onChange={setName}>
            <Label>{t.name}</Label>
            <Input placeholder={t.name + extra} />
            <Description>{t.nameHelp}{extra}</Description>
          </TextField>
          <TextField isInvalid>
            <Label>{t.name}</Label>
            <Input />
            <FieldError>{t.nameError}</FieldError>
          </TextField>
          <TextField isDisabled defaultValue={t.blocked}>
            <Label>{t.blocked}</Label>
            <Input />
          </TextField>
        </div>
        <div style={{ display: 'grid', gap: 14, width: 'min(360px, 100%)' }}>
          <TextField key={`${language}-${long}`} defaultValue={long ? t.cardText + LONG[language] : ''}>
            <Label>{t.notes}</Label>
            <TextArea rows={3} />
          </TextField>
          <Select placeholder={t.choose}>
            <Label>{t.folder}</Label>
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {['Bento', 'Pessoal', 'Estudos' + extra].map((folder) => <ListBox.Item key={folder} id={folder} textValue={folder}>{folder}<ListBox.ItemIndicator /></ListBox.Item>)}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      </Section>

      <Section title={t.choices}>
        <Switch isSelected={remind} onChange={setRemind}><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control><Label>{t.remind}{extra}</Label></Switch.Content></Switch>
        <Switch isDisabled><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control><Label>{t.disabled}</Label></Switch.Content></Switch>
        <Checkbox defaultSelected><Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Label>{t.done}</Label></Checkbox.Content></Checkbox>
        <Checkbox isDisabled><Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Label>{t.disabled}</Label></Checkbox.Content></Checkbox>
        <RadioGroup defaultValue="min50">
          <Label>{t.duration}</Label>
          {(['min25', 'min50', 'min90'] as const).map((value) => <Radio key={value} value={value}><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>{t[value]}</Label></Radio.Content></Radio>)}
        </RadioGroup>
      </Section>

      <Section title={t.cards}>
        {[0, 1, 2].map((index) => (
          <Card key={index} style={{ width: 'min(300px, 100%)' }}>
            <Card.Header><Card.Title>{t.cardTitle}{index === 2 ? extra : ''}</Card.Title><Card.Description>{t.cardText}</Card.Description></Card.Header>
            <Card.Content><Chip color="accent" variant="soft">15:00</Chip></Card.Content>
            <Card.Footer><Button variant="secondary" size="sm">{t.open}</Button></Card.Footer>
          </Card>
        ))}
      </Section>

      <Section title={t.overlays}>
        <Dropdown>
          <Button variant="secondary"><MoreHorizontal size={16} aria-hidden="true" />{t.menu}</Button>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label={t.menu}>
              <Dropdown.Item id="edit" textValue={t.edit}>{t.edit}</Dropdown.Item>
              <Dropdown.Item id="duplicate" textValue={t.duplicate}>{t.duplicate}</Dropdown.Item>
              <Dropdown.Item id="archive" textValue={t.archive}>{t.archive}{extra}</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <Popover>
          <Button variant="secondary">{t.popover}</Button>
          <Popover.Content><Popover.Dialog aria-label={t.popover}>{t.popoverText}{extra}</Popover.Dialog></Popover.Content>
        </Popover>
        <Tooltip>
          <Tooltip.Trigger><Button variant="ghost" isIconOnly aria-label={t.tooltip}><Settings2 size={16} aria-hidden="true" /></Button></Tooltip.Trigger>
          <Tooltip.Content>{t.tooltip}</Tooltip.Content>
        </Tooltip>
        <Modal>
          <Button variant="secondary">{t.dialog}</Button>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog>
                <Modal.Header><Modal.Heading>{t.dialogTitle}</Modal.Heading></Modal.Header>
                <Modal.Body>{t.dialogText}{extra}</Modal.Body>
                <Modal.Footer><Button slot="close" variant="secondary">{t.secondary}</Button><Button slot="close" variant="primary">{t.confirm}</Button></Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
        <AlertDialog>
          <Button variant="danger">{t.destructive}</Button>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog>
                <AlertDialog.Header><AlertDialog.Heading>{t.destructiveTitle}</AlertDialog.Heading></AlertDialog.Header>
                <AlertDialog.Body>{t.destructiveText}</AlertDialog.Body>
                <AlertDialog.Footer><Button slot="close" variant="secondary">{t.secondary}</Button><Button slot="close" variant="danger">{t.danger}</Button></AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </Section>

      <Section title={t.states}>
        <div style={{ display: 'grid', gap: 10, width: 'min(420px, 100%)' }}>
          <Alert status="success"><Alert.Indicator /><Alert.Content><Alert.Title>{t.success}</Alert.Title><Alert.Description>{t.successText}{extra}</Alert.Description></Alert.Content></Alert>
          <Alert status="warning"><Alert.Indicator /><Alert.Content><Alert.Title>{t.warning}</Alert.Title><Alert.Description>{t.warningText}</Alert.Description></Alert.Content></Alert>
          <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{t.failure}</Alert.Title><Alert.Description>{t.failureText}</Alert.Description></Alert.Content></Alert>
        </div>
        <div style={{ display: 'grid', gap: 14, width: 'min(300px, 100%)' }}>
          <ProgressBar value={62}><Label>{t.progress}</Label><ProgressBar.Output /><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Spinner size="md" aria-label={t.loading} /><span style={{ color: 'var(--muted)' }}>{t.loading}</span></div>
          <div style={{ display: 'grid', gap: 8 }}><Skeleton style={{ height: 14, borderRadius: 8 }} /><Skeleton style={{ height: 14, width: '70%', borderRadius: 8 }} /></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip color="accent" variant="soft">accent</Chip><Chip color="success" variant="soft">success</Chip><Chip color="warning" variant="soft">warning</Chip><Chip color="danger" variant="soft">danger</Chip><Chip color="default" variant="secondary">default</Chip>
          </div>
        </div>
        <Tabs defaultSelectedKey="day" style={{ width: 'min(320px, 100%)' }}>
          <Tabs.ListContainer>
            <Tabs.List aria-label={t.tabs}>
              <Tabs.Tab id="day">{t.day}<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="week">{t.week}<Tabs.Indicator /></Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="day">{t.dayPanel}</Tabs.Panel>
          <Tabs.Panel id="week">{t.weekPanel}</Tabs.Panel>
        </Tabs>
      </Section>

      <Section title={t.utilities}>
        {/* `block` e `outline` são utilitários do Tailwind e também classes das telas atuais: aqui dentro valem
            como utilitário, e a camada `legacy-guard` os anula fora da UI nova. */}
        <span data-utility-sample="" className="block outline outline-offset-2 rounded-lg px-3 py-2">{t.utilitiesText}</span>
      </Section>
    </HibiUiRoot>
  );
}
