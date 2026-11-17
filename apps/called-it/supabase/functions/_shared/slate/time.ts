// Slates are keyed by the US Eastern calendar date, the way the leagues list games.
const EASTERN = 'America/New_York';

function easternParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Minutes Eastern time is ahead of UTC at this instant (-300 or -240). */
function easternOffsetMinutes(at: Date): number {
  const p = easternParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The Eastern calendar date (YYYY-MM-DD) at this instant. */
export function easternDate(at: Date): string {
  const p = easternParts(at);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Turns a date and an NBA status such as "7:30 pm ET" into an ISO timestamp.
 * Returns null for anything else ("Final", "Q3 3:10", "Halftime"), which means
 * the game has started or is over.
 */
export function easternTipoff(date: string, status: string | null | undefined): string | null {
  const time = /^\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*ET\s*$/i.exec(status ?? '');
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!time || !day) return null;

  let hour = Number(time[1]) % 12;
  if (time[3].toLowerCase() === 'p') hour += 12;
  const wall = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), hour, Number(time[2]));

  // Eastern is UTC-5 or UTC-4. Guess, then correct with the real offset.
  const offset = easternOffsetMinutes(new Date(wall + 5 * 3600_000));
  return new Date(wall - offset * 60_000).toISOString();
}

/** The hour (0 to 23) on a US Eastern clock at this instant. */
export function easternHour(at: Date): number {
  return easternParts(at).hour;
}
