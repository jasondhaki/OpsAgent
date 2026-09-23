import 'server-only';

type Section = { path: string[]; body: string };

function splitSections(md: string): Section[] {
  const sections: Section[] = [];
  const stack: string[] = [];
  let body: string[] = [];
  const flush = () => {
    const text = body.join('\n').trim();
    if (text) sections.push({ path: [...stack], body: text });
    body = [];
  };
  for (const line of md.split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      stack.length = h[1].length - 1;
      stack[h[1].length - 1] = h[2].trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return sections.map((s) => ({ ...s, path: s.path.filter(Boolean) }));
}

// Window split with overlap, preferring to break on whitespace.
function windowSplit(text: string, max: number, overlap: number): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const brk = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (brk > start + max / 2) end = brk;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - overlap;
  }
  return out;
}

/**
 * Heading-aware chunker: each chunk carries its heading breadcrumb, whole sections are packed
 * greedily up to `max` chars, and only a single oversized section is window-split with `overlap`.
 */
export function chunkMarkdown(md: string, { max = 1800, overlap = 200 } = {}): string[] {
  const chunks: string[] = [];
  let buf = '';
  for (const { path, body } of splitSections(md)) {
    const text = path.length ? `${path.join(' > ')}\n${body}` : body;
    if (text.length > max) {
      if (buf) chunks.push(buf);
      buf = '';
      chunks.push(...windowSplit(text, max, overlap));
    } else if (buf && buf.length + 2 + text.length > max) {
      chunks.push(buf);
      buf = text;
    } else {
      buf = buf ? `${buf}\n\n${text}` : text;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
