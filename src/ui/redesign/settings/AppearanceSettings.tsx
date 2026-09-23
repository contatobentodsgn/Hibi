import { useId } from 'react';
import { Card, Radio, RadioGroup, Switch } from '@heroui/react';
import { Cat, Check, Monitor, Moon, PanelBottom, PanelTop, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useT } from '../../../i18n/LocaleProvider';
import type { DictionaryKey } from '../../../i18n/dictionary';
import { useThemePreference } from '../../theme-context';
import { isThemePreference, isTintPreference, type ThemePreference, type TintPreference } from '../../theme';
import { useNavigationPreferences } from '../../shell/NavigationPreferencesProvider';
import { parseNavigationPreference, type NavigationPreference } from '../../shell/navigation-preferences';
import { HibiTag } from '../components/HibiTag';
import { HibiUiRoot } from '../components/HibiUiRoot';
import './appearance-settings.css';

// `framed`: montada dentro das telas atuais, que ficam claras nos dois temas, a seção leva o próprio canvas
// da nova UI; sem ele, o título claro do tema escuro some sobre o branco. A tela nova de Ajustes (U21) não
// precisa disso.
type Props = Readonly<{ onEvent: (action: string, detail: string, result?: string) => void; framed?: boolean }>;

const THEMES: readonly Readonly<{ key: ThemePreference; label: DictionaryKey; icon: LucideIcon }>[] = [
  { key: 'light', label: 'settings.theme.light', icon: Sun },
  { key: 'dark', label: 'settings.theme.dark', icon: Moon },
  { key: 'system', label: 'settings.theme.system', icon: Monitor },
];
const TINTS: readonly TintPreference[] = ['lavender', 'blue', 'teal', 'mint', 'forest', 'amber', 'coral', 'rose', 'plum', 'graphite'];
// Como Claro, Escuro e Sistema: as duas escolhas fixas e a que se ajusta sozinha (U04b), que segue o mascote.
const POSITIONS: readonly Readonly<{ key: NavigationPreference; label: DictionaryKey; icon: LucideIcon }>[] = [
  { key: 'top', label: 'redesign.appearance.top', icon: PanelTop },
  { key: 'bottom', label: 'redesign.appearance.bottom', icon: PanelBottom },
  { key: 'auto', label: 'redesign.appearance.auto', icon: Cat },
];

// O cartão e os textos do painel do preview (`.panel`, `h3` de 14 px, descrição de 12 px no cinza do tema).
const panel = 'gap-0';
const heading = 'text-[14px] font-[560]';
const detail = 'mt-[7px] text-[12px] leading-[1.55] text-(--hibi-ink-muted)';
// O rótulo sob cada miniatura, com o visto do acento à direita quando escolhida.
const optionLabel = 'mt-[15px] flex items-center gap-1.5 text-[11px] leading-[1.5] font-normal text-(--hibi-ink)';
const optionContent = 'flex w-full min-w-0 flex-col items-stretch gap-0';
// As linhas de ajuste do preview (`.setting-row`): 22 px em cima e embaixo, fio entre elas.
const toggleRow = 'flex items-center justify-between gap-5 py-[22px]';
// Um aviso sob as opções; vazio, não ocupa espaço.
const notice = 'mt-4 text-[12px] text-(--hibi-ink-muted) empty:mt-0';

function ThemeThumbnail({ kind }: Readonly<{ kind: ThemePreference }>) {
  return (
    <div aria-hidden="true" className={`appearance-thumb${kind === 'light' ? '' : ` appearance-thumb--${kind}`}`}>
      <div className="appearance-thumb__side"><i /><i /><i /></div>
      <div className="appearance-thumb__content"><i /><div><i /><i /></div><i /></div>
    </div>
  );
}

function PositionThumbnail({ position }: Readonly<{ position: NavigationPreference }>) {
  return (
    <div aria-hidden="true" data-position={position} className="appearance-thumb appearance-position">
      <div className="appearance-position__surface">
        <span className="appearance-position__notch" />
        {/* Na automática, metade com a barra em cima e metade com ela embaixo, como o "Sistema" do tema. */}
        {position === 'auto' && <span className="appearance-position__notch appearance-position__notch--bottom" />}
        <i /><div><i /><i /></div>
      </div>
    </div>
  );
}

/**
 * A seção Aparência do preview aprovado (tema, "Um toque de cor", "Reduzir movimento" e "Mais contraste") e a
 * posição da barra de navegação, que o preview não tinha como ajuste (seção 3.2 do plano). Tudo vale na hora,
 * sem remontar as telas: tema, tom, contraste e movimento pelo `ThemeProvider`; a posição pela preferência da
 * navegação.
 */
export function AppearanceSettings({ onEvent, framed = false }: Props) {
  const t = useT();
  const { preference, setPreference, tint, setTint, contrast, setContrast, motion, setMotion } = useThemePreference();
  const { preference: navigation, setPreference: setNavigation, mascotSharesDisplay, saveFailed } = useNavigationPreferences();
  const ids = { title: useId(), theme: useId(), tint: useId(), navigation: useId() };
  const toggles = [
    { key: 'motion', title: t('tint.motion'), detail: t('tint.motionDetail'), on: motion === 'reduce', change: (on: boolean) => { setMotion(on ? 'reduce' : 'system'); onEvent('edit', 'Motion', on ? 'reduce' : 'system'); } },
    { key: 'contrast', title: t('tint.contrast'), detail: t('tint.contrastDetail'), on: contrast === 'more', change: (on: boolean) => { setContrast(on ? 'more' : 'normal'); onEvent('edit', 'Contrast', on ? 'more' : 'normal'); } },
  ];

  return (
    <HibiUiRoot className={framed ? 'appearance-settings rounded-[24px] bg-(--hibi-canvas) p-6' : 'appearance-settings'}>
      <section aria-labelledby={ids.title}>
        <header className="mb-[21px]">
          <h2 id={ids.title} className="text-[21px] font-[560] tracking-[-0.025em]">{t('redesign.appearance.title')}</h2>
          <p className="mt-1.5 text-[12px] leading-[1.55] text-(--hibi-ink-muted)">{t('redesign.appearance.detail')}</p>
        </header>

        <div className="flex flex-col gap-[18px]">
          <Card className={panel}>
            <h3 id={ids.theme} className={heading}>{t('redesign.appearance.theme')}</h3>
            <p className={detail}>{t('redesign.appearance.themeDetail')}</p>
            <RadioGroup
              aria-labelledby={ids.theme}
              orientation="horizontal"
              value={preference}
              onChange={(value) => { if (isThemePreference(value)) { setPreference(value); onEvent('edit', 'Theme', value); } }}
              className="mt-[22px] grid grid-cols-3 gap-[14px]"
            >
              {THEMES.map(({ key, label, icon: Icon }) => (
                <Radio key={key} value={key} className="min-w-0">
                  <Radio.Content className={optionContent}>
                    <ThemeThumbnail kind={key} />
                    <span className={optionLabel}>
                      <Icon aria-hidden="true" size={15} />
                      {t(label)}
                      {preference === key && <Check aria-hidden="true" size={15} className="ml-auto text-(--hibi-accent)" />}
                    </span>
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
          </Card>

          <Card className={panel}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id={ids.tint} className={heading}>{t('redesign.appearance.tint')}</h3>
                <p className={detail}>{t('redesign.appearance.tintDetail')}</p>
              </div>
              <HibiTag>{t(`tint.${tint}`)}</HibiTag>
            </div>
            <RadioGroup
              aria-labelledby={ids.tint}
              orientation="horizontal"
              value={tint}
              onChange={(value) => { if (isTintPreference(value)) { setTint(value); onEvent('edit', 'Tint', value); } }}
              className="mt-[23px] flex flex-row gap-[14px] p-[3px]"
            >
              {TINTS.map((key) => (
                <Radio key={key} value={key} aria-label={t(`tint.${key}`)}>
                  <Radio.Content className={`appearance-swatch appearance-swatch--${key}`}>
                    {tint === key && <Check aria-hidden="true" size={18} />}
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
          </Card>

          <Card className={panel}>
            <h3 id={ids.navigation} className={heading}>{t('redesign.appearance.navigation')}</h3>
            <p className={detail}>{t('redesign.appearance.navigationDetail')} {t('redesign.appearance.autoDetail')}</p>
            <RadioGroup
              aria-labelledby={ids.navigation}
              orientation="horizontal"
              value={navigation}
              onChange={(value) => { const next = parseNavigationPreference(value); setNavigation(next); onEvent('edit', 'Navigation position', next); }}
              className="mt-[22px] grid grid-cols-3 gap-[14px]"
            >
              {POSITIONS.map(({ key, label, icon: Icon }) => (
                <Radio key={key} value={key} className="min-w-0">
                  <Radio.Content className={optionContent}>
                    <PositionThumbnail position={key} />
                    <span className={optionLabel}>
                      <Icon aria-hidden="true" size={15} />
                      {t(label)}
                      {navigation === key && <Check aria-hidden="true" size={15} className="ml-auto text-(--hibi-accent)" />}
                    </span>
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
            {/* Os avisos ficam sempre na página, vazios quando não há o que dizer: o leitor de tela anuncia a
                mudança de texto de uma região que já existia, e costuma calar uma que nasce com o texto dentro. */}
            <p role="status" className={notice}>{navigation === 'auto' ? t(mascotSharesDisplay ? 'redesign.appearance.autoNowBottom' : 'redesign.appearance.autoNowTop') : null}</p>
            <p role="status" className={notice}>{saveFailed ? t('redesign.appearance.positionNotSaved') : null}</p>
          </Card>

          <Card className={`${panel} px-6 py-0`}>
            {toggles.map((toggle, index) => (
              <div key={toggle.key} className={index < toggles.length - 1 ? `${toggleRow} border-b border-(--hibi-line)` : toggleRow}>
                <div>
                  <h3 className="text-[12px] font-[560]">{toggle.title}</h3>
                  <p className="mt-[5px] text-[11px] leading-[1.55] text-(--hibi-ink-muted)">{toggle.detail}</p>
                </div>
                <Switch aria-label={toggle.title} isSelected={toggle.on} onChange={toggle.change}>
                  <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
                </Switch>
              </div>
            ))}
          </Card>
        </div>
      </section>
    </HibiUiRoot>
  );
}
