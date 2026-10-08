import path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.log',
  '.yaml',
  '.yml',
  '.rtf',
  '.tsv',
]);

function looksLikeUtf8Text(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, 12_000));
  if (!sample.length) return true;
  let bad = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const b = sample[i];
    if (b === 0) bad += 1;
    else if (b < 9 || (b > 13 && b < 32 && b !== 27)) bad += 0.25;
  }
  return bad / sample.length < 0.02;
}

function storageBasename(originalName) {
  const base = path.basename(String(originalName || 'upload').replace(/\\/g, '/'));
  const stem = base.replace(/\.[^.]+$/, '') || 'upload';
  const safe = stem.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return `${safe || 'upload'}.txt`;
}

/**
 * Turn an uploaded file (text or base64 binary) into plain text for RAG.
 */
export async function extractDocumentText({ text, file_base64, filename, content_type }) {
  if (typeof text === 'string' && text.length && !file_base64) {
    return { text, storageName: storageBasename(filename) };
  }

  if (!file_base64 || typeof file_base64 !== 'string') {
    const err = new Error('Provide text or file_base64 with filename');
    err.status = 400;
    throw err;
  }

  let buf;
  try {
    buf = Buffer.from(file_base64, 'base64');
  } catch {
    const err = new Error('Invalid file encoding');
    err.status = 400;
    throw err;
  }

  if (!buf.length) {
    const err = new Error('Empty file');
    err.status = 400;
    throw err;
  }

  const name = String(filename || 'upload');
  const ext = path.extname(name).toLowerCase();
  const mime = String(content_type || '').toLowerCase();

  if (ext === '.pdf' || mime === 'application/pdf') {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParse(buf);
    const out = String(parsed.text || '').trim();
    if (!out) {
      const err = new Error('PDF had no extractable text. Try a text export or paste into a .txt file.');
      err.status = 400;
      throw err;
    }
    return { text: out, storageName: storageBasename(name) };
  }

  const treatAsText =
    TEXT_EXTENSIONS.has(ext) ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime.includes('csv') ||
    looksLikeUtf8Text(buf);

  if (treatAsText) {
    return { text: buf.toString('utf8'), storageName: storageBasename(name) };
  }

  const err = new Error(
    'Could not read this file as text. Supported: plain text, CSV, JSON, Markdown, HTML, PDF, and most UTF-8 text exports.'
  );
  err.status = 400;
  throw err;
}
