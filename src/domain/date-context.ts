const pad = (value: number) => String(value).padStart(2, '0');

// Um dia de calendário é sempre o do relógio de quem usa o app, montado com os componentes locais
// da data. `toISOString()` devolveria o dia UTC, que em São Paulo já é o seguinte depois das 21h.
export const localDateKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Hoje, pelo relógio local. */
export const todayKey = (now: Date = new Date()): string => localDateKey(now);

/** Meio-dia local do dia informado: instante estável para rotular o dia e para somar dias. */
export function localNoon(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

/** O mesmo dia deslocado de `days`, ainda no calendário local. */
export const shiftDayKey = (key: string, days: number): string => {
  const date = localNoon(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};
