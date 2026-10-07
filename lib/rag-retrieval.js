const EXCERPT_LEN = 90;

const KIND_RULES = [
  { re: /01_.*policy|policy/i, kind: 'Policy' },
  { re: /02_.*treaty|treaty/i, kind: 'Treaty' },
  { re: /03_.*claim|claim_form/i, kind: 'Claim' },
  { re: /04_.*flood|investigation/i, kind: 'Report' },
  { re: /05_.*historical|claims\.csv/i, kind: 'History' },
];

export function classifySource(sourcePath) {
  const base = String(sourcePath || 'document').split(/[/\\]/).pop() || 'document';
  const kind = KIND_RULES.find((r) => r.re.test(base))?.kind || 'Doc';
  return { file: base, kind };
}

export function formatRetrievalResults(results) {
  const sources = [];
  const context = results.map((doc, i) => {
    const raw = doc.metadata?.source || doc.metadata?.file || '';
    const { file, kind } = classifySource(raw);
    const excerpt = String(doc.pageContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, EXCERPT_LEN);
    sources.push({
      id: i + 1,
      file,
      kind,
      excerpt,
    });
    return `Context #${i + 1} (${kind}: ${file}):\n${doc.pageContent}`;
  });
  return { context, sources };
}
