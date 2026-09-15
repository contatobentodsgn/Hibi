// Horário de bloco do Hibi é hora de parede flutuante: `2026-09-15T09:00:00`, sem fuso (ver
// docs/superpowers/specs/2026-09-11-floating-local-time-design.md). EventKit e Google Calendar
// precisam de um instante, então a conversão acontece aqui, na borda do processo principal, com o
// fuso local da máquina. Um valor que já traz `Z` ou offset é um instante e é respeitado como tal.
const FLOATING = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ABSOLUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ZONE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
const pad = (value, size = 2) => String(value).padStart(size, "0");

/** O instante de um horário do Hibi ou de um provedor, ou `null` se o texto não for uma data válida. */
function toInstant(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const local = FLOATING.exec(value) ?? DATE_ONLY.exec(value);
  if (local) {
    const [, year, month, day, hour = "0", minute = "0", second = "0", millis = "0"] = local;
    if (+hour > 23 || +minute > 59 || +second > 59) return null;
    const date = new Date(+year, +month - 1, +day, +hour, +minute, +second, +millis.padEnd(3, "0"));
    // `2026-02-31` viraria 3 de março em silêncio. Numa lacuna de horário de verão a hora pula para
    // frente, como o relógio do sistema, mas o dia continua o mesmo.
    if (date.getFullYear() !== +year || date.getMonth() !== +month - 1 || date.getDate() !== +day) return null;
    return date;
  }
  if (!ABSOLUTE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-09-15T09:00:00-03:00`: sem frações de segundo e com o offset local, que o EventKit e o Google aceitam. */
function toOffsetIso(date) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/** O dia de calendário local do instante, `2026-09-15`. */
function localDateKey(date) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** O fuso IANA da máquina, para o Google interpretar recorrência e horário de verão como o Mac. */
function localTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && ZONE.test(zone) ? zone : null;
  } catch {
    return null;
  }
}

module.exports = { localDateKey, localTimeZone, toInstant, toOffsetIso };
