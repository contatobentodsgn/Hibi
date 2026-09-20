import { useEffect, useState } from 'react';
import { todayKey } from '../domain/date-context';

const CHECK_EVERY_MS = 30_000;

/**
 * O dia de calendário local, que vira sozinho. As telas calculam "hoje" ao renderizar; com a janela
 * escondida na barra de menus, nada renderiza de novo, e depois da meia-noite a tela continuava no dia
 * anterior — um hábito marcado ali ia para ontem. Um intervalo curto, e não um timer até a meia-noite:
 * com o Mac dormindo o timer atrasa, e a volta da janela (foco, visibilidade) confere na hora.
 */
export function useCalendarDay(): string {
  const [day, setDay] = useState(() => todayKey());
  useEffect(() => {
    const check = () => setDay((current) => { const next = todayKey(); return next === current ? current : next; });
    const interval = window.setInterval(check, CHECK_EVERY_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  return day;
}
