import { describe, expect, it } from 'vitest';
import { chunkMarkdown } from '@/server/kb/chunk';
import { findPlaceholders } from '@/lib/placeholders';

describe('chunkMarkdown', () => {
  it('prefixes each section with its heading breadcrumb', () => {
    const [c] = chunkMarkdown('# Delivery\n## Outside Dhaka\nIt costs X.');
    expect(c).toBe('Delivery > Outside Dhaka\nIt costs X.');
  });

  it('packs small sections together and starts a new chunk when full', () => {
    const md = ['# A', 'a'.repeat(50), '# B', 'b'.repeat(50), '# C', 'c'.repeat(50)].join('\n');
    const chunks = chunkMarkdown(md, { max: 120, overlap: 10 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('A\n');
    expect(chunks[0]).toContain('B\n');
    expect(chunks[1].startsWith('C\n')).toBe(true);
  });

  it('never splits a section that fits, even at a chunk boundary', () => {
    const md = ['# A', 'x '.repeat(40), '# B', 'y '.repeat(40)].join('\n');
    for (const c of chunkMarkdown(md, { max: 100, overlap: 10 })) {
      expect(c.includes('x') && c.includes('y')).toBe(false);
    }
  });

  it('window-splits an oversized section with overlap and respects max', () => {
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkMarkdown(`# Big\n${words}`, { max: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
    const tail = chunks[0].split(' ').at(-1)!;
    expect(chunks[1]).toContain(tail); // overlap carries context across the cut
  });

  it('handles Bangla text and CRLF', () => {
    const chunks = chunkMarkdown('# ডেলিভারি\r\nঢাকার ভিতরে ৭০ টাকা।\r\n');
    expect(chunks).toEqual(['ডেলিভারি\nঢাকার ভিতরে ৭০ টাকা।']);
  });
});

describe('findPlaceholders', () => {
  it('returns unique tokens', () => {
    expect(findPlaceholders('{{A}} and {{B}} and {{A}}')).toEqual(['{{A}}', '{{B}}']);
    expect(findPlaceholders('no tokens, just {braces}')).toEqual([]);
  });
});
