// Display helpers. Times are stored as timestamptz and always shown in Asia/Dhaka (CLAUDE.md §13).

const dhaka = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
export const formatDhaka = (iso: string) => dhaka.format(new Date(iso));

export function age(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export const humanize = (s: string) => s.replaceAll('_', ' ');

export const minutesSince = (iso: string, now = Date.now()) => (now - new Date(iso).getTime()) / 60_000;
