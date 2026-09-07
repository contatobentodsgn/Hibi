const MAX_TIMEOUT_MS = 2_147_000_000;
const MAX_ENTRIES = 1000;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 500;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_OFFSET = '-03:00';

function parseDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isDate(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value) && parseDate(`${value}T00:00:00${LOCAL_OFFSET}`) !== null;
}

function isTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
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

function nextOccurrence(entry, afterMs) {
  const firstAt = parseDate(entry.at);
  if (firstAt === null) return null;
  const recurrence = validRecurrence(entry.recurrence);
  if (!recurrence) return firstAt > afterMs ? firstAt : null;

  const afterDate = startOfDay(new Date(afterMs));
  const startDate = new Date(`${recurrence.startDate}T00:00:00${LOCAL_OFFSET}`);
  const firstDate = afterDate > startDate ? afterDate : startDate;
  const maxDays = recurrence.frequency === 'daily' ? 370 : 14;
  const fallbackTime = isTime(entry.at.slice(11, 16)) ? entry.at.slice(11, 16) : '09:00';

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

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, MAX_ENTRIES).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > MAX_ID_LENGTH || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > MAX_TITLE_LENGTH || typeof entry.body !== 'string' || !entry.body.trim() || entry.body.length > MAX_BODY_LENGTH) return [];
    if (entry.kind !== 'deadline' && entry.kind !== 'reminder') return [];
    if (parseDate(entry.at) === null) return [];
    const recurrence = validRecurrence(entry.recurrence);
    if (entry.recurrence && !recurrence) return [];
    return [{ id: entry.id, kind: entry.kind, title: entry.title.trim(), body: entry.body.trim(), at: entry.at, recurrence }];
  });
}

function createNotificationScheduler({ NotificationClass, now = Date.now, setTimeout: setTimeoutFn = setTimeout, clearTimeout: clearTimeoutFn = clearTimeout, onTrigger = () => undefined } = {}) {
  const timers = new Map();

  function clear() {
    for (const timer of timers.values()) clearTimeoutFn(timer);
    timers.clear();
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
    const occurrence = nextOccurrence(entry, now());
    if (occurrence === null) return;
    const delay = occurrence - now();
    const timer = setTimeoutFn(() => {
      timers.delete(entry.id);
      if (occurrence > now()) {
        schedule(entry);
        return;
      }
      show(entry);
      onTrigger(entry);
      if (entry.recurrence) schedule(entry);
    }, Math.min(Math.max(delay, 1), MAX_TIMEOUT_MS));
    timers.set(entry.id, timer);
  }

  return {
    sync(entries) {
      clear();
      for (const entry of sanitizeEntries(entries)) schedule(entry);
    },
    clear,
  };
}

module.exports = { MAX_TIMEOUT_MS, MAX_ENTRIES, MAX_ID_LENGTH, MAX_TITLE_LENGTH, MAX_BODY_LENGTH, createNotificationScheduler, nextOccurrence, sanitizeEntries };
