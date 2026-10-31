// The paper's figures and tables, read out of README.md at build time so the
// viewer's Figures tab can never drift from the paper. A figure line in the
// README is `- Figure N. Title: [link text](href). Caption.`; a table opens a
// paragraph as `**Table N. Title.** Caption...`. Links to the live page become
// in-page hashes (a frame of this replay); links to files in the repository
// and to sections of the README go to GitHub. Pure: no DOM, no I/O.

export const README_URL = 'https://github.com/jamesrosing/your-procedure-is-denied';
export const REPO_BLOB_URL = `${README_URL}/blob/main/`;
const DEMO_HASH = /^https:\/\/demo\.hemeehr\.com\/?#/;

export interface CaptionSegment { text: string; href?: string; inPage?: boolean }
export interface PaperFigure { n: number; title: string; anchor: string; segments: CaptionSegment[] }
export interface PaperTable { n: number; title: string; caption: string; anchor: string; href: string }
export interface PaperIndex { figures: PaperFigure[]; tables: PaperTable[] }

// GitHub's anchor for a heading: lowercase, punctuation dropped, spaces to hyphens.
export function githubAnchor(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
}

function resolveHref(href: string): { href: string; inPage: boolean } {
  if (DEMO_HASH.test(href)) return { href: `#${href.slice(href.indexOf('#') + 1)}`, inPage: true };
  if (/^[a-z]+:/i.test(href)) return { href, inPage: false };
  return { href: `${REPO_BLOB_URL}${href.replace(/^\.?\//, '')}`, inPage: false };
}

// Markdown links in a line, as plain segments around linked ones.
function segmentsOf(line: string): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(line); m !== null; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    out.push({ text: m[1] ?? '', ...resolveHref(m[2] ?? '') });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(?:\s|$)/.exec(text.trim());
  return m?.[1] ?? text.trim();
}

export function paperIndex(readme: string): PaperIndex {
  const figures: PaperFigure[] = [];
  const tables: PaperTable[] = [];
  const headings: { number: string; anchor: string }[] = [];
  let anchor = '';
  for (const raw of readme.split('\n')) {
    const line = raw.trimEnd();
    const h = /^#{2,3}\s+(.+)$/.exec(line);
    if (h) {
      anchor = githubAnchor(h[1] ?? '');
      const num = /^(\d+(?:\.\d+)*)\.?\s/.exec(h[1] ?? '');
      if (num) headings.push({ number: num[1] ?? '', anchor });
      continue;
    }
    const fig = /^- Figure (\d+)\. (.+)$/.exec(line);
    if (fig) {
      const body = fig[2] ?? '';
      const segments = segmentsOf(body);
      const plain = segments.map(s => s.text).join('');
      const colon = plain.indexOf(':');
      const title = (colon > 0 && colon < 90 ? plain.slice(0, colon) : firstSentence(plain).replace(/\.$/, '')).trim();
      if (!segments.some(s => s.href)) {
        // No link: a figure that names a section of the paper links to that section.
        const ref = /section (\d+(?:\.\d+)*)/.exec(plain);
        const target = ref ? headings.find(x => x.number === ref[1]) : undefined;
        if (target) {
          const at = plain.indexOf(ref![0]);
          segments.splice(0, segments.length, { text: plain.slice(0, at) }, { text: ref![0], href: `${README_URL}#${target.anchor}`, inPage: false }, { text: plain.slice(at + ref![0].length) });
        }
      }
      figures.push({ n: Number(fig[1]), title, anchor, segments: segments.filter(s => s.text.length > 0) });
      continue;
    }
    const tab = /^\*\*Table (\d+)\. ([^*]+?)\.?\*\*\s*(.*)$/.exec(line);
    if (tab) {
      const caption = firstSentence(segmentsOf(tab[3] ?? '').map(s => s.text).join('').replace(/`/g, ''));
      tables.push({ n: Number(tab[1]), title: (tab[2] ?? '').trim(), caption, anchor, href: `${README_URL}#${anchor}` });
    }
  }
  return { figures, tables };
}
