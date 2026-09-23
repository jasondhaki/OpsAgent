import 'server-only';

export const MAX_BODY_CHARS = 8000;

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

// Lines that start a quoted earlier message; everything from here down is dropped.
const QUOTE_HEADERS = [
  /^On .{0,200}wrote:\s*$/m, // Gmail en
  /^.{0,200}লিখেছেন:\s*$/m, // Gmail bn
  /^-{2,}\s*(Original Message|Forwarded message)/im,
  /^From: .+\r?\n(Sent|Date): /m, // Outlook
];
const SIGNATURE_STARTS = [/^-- ?$/m, /^Sent from my \w+/im, /^Get Outlook for /im];

/** Clean an inbound email body: strip HTML leftovers, quoted replies, signatures; cap length. */
export function normalizeBody(raw: string): string {
  let s = raw.replace(/\r\n/g, '\n');
  if (/<[a-z][^>]*>/i.test(s)) {
    s = s.replace(/<(br|\/p|\/div)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  }
  s = s.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]);
  for (const re of [...QUOTE_HEADERS, ...SIGNATURE_STARTS]) {
    const m = re.exec(s);
    if (m && m.index > 0) s = s.slice(0, m.index);
  }
  s = s
    .split('\n')
    .filter((l) => !l.startsWith('>'))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.slice(0, MAX_BODY_CHARS);
}

/** ০-৯ → 0-9. Used on a copy for matching; never shown to customers. */
export function bnDigitsToAscii(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}
