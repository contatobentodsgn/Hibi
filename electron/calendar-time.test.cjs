const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { localDateKey, localTimeZone, toInstant, toOffsetIso } = require("./calendar-time.cjs");

// O fuso do processo de teste varia (a bateria roda em São Paulo e em Kiritimati), então os casos com
// offset fixo rodam num processo filho com `TZ` explícito.
const inZone = (zone, expression) =>
  execFileSync(
    process.execPath,
    ["-e", `const t = require(${JSON.stringify(require.resolve("./calendar-time.cjs"))}); process.stdout.write(String(${expression}));`],
    { env: { ...process.env, TZ: zone }, encoding: "utf8" },
  );

test("converts a floating Hibi block time to the wall clock of the machine's own zone", () => {
  assert.equal(inZone("Pacific/Kiritimati", 't.toOffsetIso(t.toInstant("2026-09-15T09:00:00"))'), "2026-09-15T09:00:00+14:00");
  assert.equal(inZone("America/Sao_Paulo", 't.toOffsetIso(t.toInstant("2026-09-15T09:00:00"))'), "2026-09-15T09:00:00-03:00");
  assert.equal(inZone("Asia/Kolkata", 't.toOffsetIso(t.toInstant("2026-09-15T09:30"))'), "2026-09-15T09:30:00+05:30");
  assert.equal(inZone("Pacific/Kiritimati", 't.localTimeZone()'), "Pacific/Kiritimati");
});

test("keeps an instant that already carries Z or an offset, and formats it without fractions", () => {
  assert.equal(toInstant("2026-09-15T12:00:00.000Z").toISOString(), "2026-09-15T12:00:00.000Z");
  assert.equal(toInstant("2026-09-15T09:00:00-03:00").toISOString(), "2026-09-15T12:00:00.000Z");
  assert.equal(inZone("America/Sao_Paulo", 't.toOffsetIso(t.toInstant("2026-09-15T12:00:00.000Z"))'), "2026-09-15T09:00:00-03:00");
  assert.match(toOffsetIso(toInstant("2026-09-15T09:00:00.250")), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test("reads a date-only value as local midnight and reports its local day", () => {
  const midnight = toInstant("2026-09-15");
  assert.equal(midnight.getHours(), 0);
  assert.equal(localDateKey(midnight), "2026-09-15");
  assert.equal(localDateKey(toInstant("2026-09-15T23:30:00")), "2026-09-15");
});

test("rejects impossible or ambiguous date text instead of guessing", () => {
  for (const value of ["2026-02-31T09:00:00", "2026-09-15T24:00:00", "2026-09-15T09:60:00", "2026-09-15T09:00:00+1400", "tomorrow", "", 42, null, "2026-09-15T09:00:00".padEnd(80, "0")])
    assert.equal(toInstant(value), null, String(value));
  assert.equal(typeof localTimeZone(), "string");
});
