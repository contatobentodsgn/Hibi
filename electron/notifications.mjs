import { isExempt, nextDelivery, sanitizeFocusSettings, sanitizeFocusUntil } from './focus-gate.mjs';

export const MAX_TIMEOUT_MS = 2_147_000_000;
export const MAX_ENTRIES = 1000;
export const MAX_ID_LENGTH = 128;
export const MAX_TITLE_LENGTH = 500;
export const MAX_BODY_LENGTH = 500;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// A recurrence that names no time of day has always defaulted to the start of the working morning.
const DEFAULT_RECURRENCE_TIME = '09:00';

// Reminder and deadline times are wall clock: 09:00 means 09:00 wherever the person is, the way an
// iCal DTSTART without a TZID behaves. So every value below is read digit by digit off the stored
// string and rebuilt from local components. The trailing offset -- `-03:00`, `Z`, or nothing at all
// -- is deliberately ignored rather than handed to Date.parse, which would pin the reminder to the
// instant it was written in and drag it across the clock for anyone in another zone.

function calendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(2000, 0, 1, 0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  // A day that rolled over while being built (2026-02-31 becomes 2026-03-03) never existed.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isDate(value) {
  return calendarDate(value) !== null;
}

function isTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

// `at` is stored as `YYYY-MM-DDTHH:MM...`. A deadline imported without a time of day stays a bare
// `YYYY-MM-DD`; it is due from the start of that local day, so the missing time reads as null here
// and each caller supplies the default that suits it.
function wallClock(at) {
  if (typeof at !== 'string') return null;
  const date = calendarDate(at.slice(0, 10));
  if (date === null) return null;
  if (at.length === 10) return { date, time: null };
  if (at.charAt(10) !== 'T') return null;
  const time = at.slice(11, 16);
  return isTime(time) ? { date, time } : null;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateAfter(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function localDateTime(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
  return result.getTime();
}

function validRecurrence(recurrence) {
  if (!recurrence || !['daily', 'weekly'].includes(recurrence.frequency) || !isDate(recurrence.startDate)) return null;
  const endDate = recurrence.endDate && isDate(recurrence.endDate) ? recurrence.endDate : undefined;
  const time = isTime(recurrence.time) ? recurrence.time : undefined;
  const weekdays = Array.isArray(recurrence.weekdays)
    ? [...new Set(recurrence.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : undefined;
  const timesByWeekday = recurrence.timesByWeekday && typeof recurrence.timesByWeekday === 'object'
    ? Object.fromEntries(Object.entries(recurrence.timesByWeekday).filter(([day, value]) => /^[0-6]$/.test(day) && isTime(value)))
    : undefined;
  if (recurrence.frequency === 'weekly' && (!weekdays || weekdays.length === 0)) return null;
  return { frequency: recurrence.frequency, startDate: recurrence.startDate, endDate, time, weekdays, timesByWeekday };
}

export function nextOccurrence(entry, afterMs) {
  const first = wallClock(entry.at);
  if (first === null) return null;
  const recurrence = validRecurrence(entry.recurrence);
  if (!recurrence) {
    // The one-off firing is built the same way the recurring one is, so the same 09:00 lands on the
    // same local clock face whether or not the reminder repeats.
    const firstMs = localDateTime(first.date, first.time ?? '00:00');
    return firstMs > afterMs ? firstMs : null;
  }

  const afterDate = startOfDay(new Date(afterMs));
  const startDate = calendarDate(recurrence.startDate);
  const firstDate = afterDate > startDate ? afterDate : startDate;
  const maxDays = recurrence.frequency === 'daily' ? 370 : 14;
  const fallbackTime = first.time ?? DEFAULT_RECURRENCE_TIME;

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const candidateDate = dateAfter(firstDate, offset);
    const candidateKey = dateKey(candidateDate);
    if (recurrence.endDate && candidateKey > recurrence.endDate) return null;
    let time;
    if (recurrence.frequency === 'daily') {
      time = recurrence.time || fallbackTime;
    } else if (recurrence.weekdays.includes(candidateDate.getDay())) {
      time = recurrence.timesByWeekday?.[candidateDate.getDay()] || recurrence.time || fallbackTime;
    }
    if (!time) continue;
    const candidateMs = localDateTime(candidateDate, time);
    if (candidateMs > afterMs) return candidateMs;
  }
  return null;
}

export function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, MAX_ENTRIES).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > MAX_ID_LENGTH || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > MAX_TITLE_LENGTH || typeof entry.body !== 'string' || !entry.body.trim() || entry.body.length > MAX_BODY_LENGTH) return [];
    if (entry.kind !== 'deadline' && entry.kind !== 'reminder') return [];
    if (wallClock(entry.at) === null) return [];
    const recurrence = validRecurrence(entry.recurrence);
    if (entry.recurrence && !recurrence) return [];
    // A categoria só viaja quando é uma das duas conhecidas, e some quando ausente: é ela que o
    // portão de foco lê para decidir o que silenciar.
    const category = entry.category === 'important' || entry.category === 'wellbeing' ? entry.category : undefined;
    return [{ id: entry.id, kind: entry.kind, title: entry.title.trim(), body: entry.body.trim(), at: entry.at, recurrence, ...(category ? { category } : {}) }];
  });
}

export function createNotificationScheduler({ NotificationClass, now = Date.now, setTimeout: setTimeoutFn = setTimeout, clearTimeout: clearTimeoutFn = clearTimeout, onTrigger = () => undefined } = {}) {
  const timers = new Map();
  // Ocorrências retidas pelo portão, por id. Sem este registro, terminar a sessão de foco mais cedo
  // PERDERIA o lembrete: o sync seguinte recalcularia a partir de agora e `nextOccurrence` descarta
  // uma ocorrência já vencida. Silenciar é adiar, e adiar exige lembrar o que foi adiado.
  const deferred = new Map();
  let focusSettings = sanitizeFocusSettings(undefined);
  let focusUntilMs = null;
  // O último alerta não isento que saiu de fato, para o intervalo do preset valer entre entradas
  // diferentes e não só dentro de uma.
  let lastNudgeAtMs = null;

  function clear() {
    for (const timer of timers.values()) clearTimeoutFn(timer);
    timers.clear();
  }

  function gateContext() {
    return { settings: focusSettings, focusUntilMs, lastNudgeAtMs };
  }

  // Uma ocorrência retida vale enquanto o lembrete for o mesmo. Se o horário ou a recorrência mudarem,
  // o que estava adiado deixou de existir e a ocorrência é recalculada do zero.
  function signatureOf(entry) {
    return JSON.stringify([entry.at, entry.recurrence ?? null]);
  }

  function hold(entry, occurrenceMs) {
    deferred.set(entry.id, { occurrenceMs, signature: signatureOf(entry) });
  }

  function show(entry) {
    if (typeof NotificationClass !== 'function') return;
    try {
      const notification = new NotificationClass({ title: entry.title, body: entry.body });
      notification.show();
    } catch {
      // Notification availability can change with OS permissions; keep scheduling alive.
    }
  }

  function schedule(entry) {
    // Uma ocorrência já retida continua valendo; só quando não há nada adiado é que se pergunta a
    // próxima. É isso que faz o lembrete preso na sessão sair quando a sessão acaba, em vez de sumir.
    const held = deferred.get(entry.id);
    const occurrence = held && held.signature === signatureOf(entry) ? held.occurrenceMs : nextOccurrence(entry, now());
    if (occurrence === null || occurrence === undefined) {
      deferred.delete(entry.id);
      return;
    }
    // O PORTÃO. O agendador é o único que sabe quando algo dispara, então é aqui que a decisão vale.
    const delivery = nextDelivery(entry, occurrence, gateContext());
    if (delivery > occurrence) hold(entry, occurrence);
    else deferred.delete(entry.id);
    const timer = setTimeoutFn(() => {
      timers.delete(entry.id);
      // Rearma quando o timer foi fatiado (MAX_TIMEOUT_MS) ou quando o portão empurrou a entrega para
      // mais tarde enquanto este timer corria — outro alerta pode ter consumido o intervalo do preset.
      if (delivery > now() || nextDelivery(entry, occurrence, gateContext()) > now()) {
        // Prende a ocorrência ANTES de reagendar. Sem isto, `nextOccurrence` recomeçaria de agora e a
        // ocorrência de hoje — que acabou de ser adiada — seria pulada para a de amanhã: o lembrete
        // silenciado nunca chegaria. Adiar só é diferente de descartar se o adiado for lembrado.
        hold(entry, occurrence);
        schedule(entry);
        return;
      }
      deferred.delete(entry.id);
      show(entry);
      onTrigger(entry);
      if (!isExempt(entry)) lastNudgeAtMs = now();
      if (entry.recurrence) schedule(entry);
    }, Math.min(Math.max(delivery - now(), 1), MAX_TIMEOUT_MS));
    timers.set(entry.id, timer);
  }

  return {
    // O renderer manda a janela de foco e os ajustes JUNTO das entradas: ele é quem conhece o estado
    // da sessão, e já re-sincroniza a cada mudança. Assim o horário ativo, o foco e a intensidade dos
    // nudges passam todos pelo mesmo portão, em vez de serem decididos em telas separadas.
    sync(entries, context) {
      clear();
      focusSettings = sanitizeFocusSettings(context && context.settings);
      focusUntilMs = sanitizeFocusUntil(context && context.focusUntilMs);
      const sanitized = sanitizeEntries(entries);
      // Uma entrada que saiu do snapshot (apagada, pausada) não tem mais nada a adiar.
      const present = new Set(sanitized.map((entry) => entry.id));
      for (const id of [...deferred.keys()]) if (!present.has(id)) deferred.delete(id);
      for (const entry of sanitized) schedule(entry);
    },
    clear,
  };
}

