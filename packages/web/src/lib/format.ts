const LOCALE = 'ar-u-nu-latn';
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const numberFormat = new Intl.NumberFormat(LOCALE, { notation: 'compact' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'الآن';
}

export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));
export const formatCount = (n: number): string => numberFormat.format(n);
