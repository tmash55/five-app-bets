/** Calendar days are local to the device, written as YYYY-MM-DD. */
export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(date: Date = new Date()): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parse(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = parse(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/** Whole days since 1970-01-01, for rotating the daily picks. */
export function dayNumber(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
