const weekdayNumber: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function firstWeeklyOccurrence(startDate: string, parts: string[]): { date: string; time: string } | undefined {
  return parts.map((part) => {
    const day = weekdayNumber[part.slice(0, 3).toLowerCase()];
    if (day === undefined || !/^\d{2}:\d{2}$/.test(part.slice(4))) return undefined;
    const date = new Date(`${startDate}T12:00:00-03:00`);
    date.setDate(date.getDate() + ((day - date.getDay() + 7) % 7));
    return { date: date.toISOString().slice(0, 10), time: part.slice(4) };
  }).filter((item): item is { date: string; time: string } => Boolean(item)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
}
