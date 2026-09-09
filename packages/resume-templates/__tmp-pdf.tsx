import React from 'react';
import { Document, Page, renderToBuffer } from '@react-pdf/renderer';
import { PdfRichText } from './src/pdf/PdfRichText';
import zlib from 'node:zlib';

const html = `<p><strong>TitleBoldHere</strong></p><ul><li><p>plain lead <strong>BOLDINLIST</strong> tail plain</p></li></ul>`;

const doc = (
  <Document>
    <Page size="A4" style={{ padding: 40 }}>
      <PdfRichText html={html} color="#000000" fontFamily="Helvetica" fontSize={11} />
    </Page>
  </Document>
);

const main = async () => {
  const buf = await renderToBuffer(doc);
  const raw = buf.toString('latin1');

  // font resources
  for (const m of raw.matchAll(/\/(F\d+)\s+\d+\s+0\s+R/g)) console.log('res', m[0]);
  for (const m of raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g)) console.log('BaseFont', m[1]);

  // decompress streams and print text operators
  const re = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    const chunk = Buffer.from(raw.slice(start, end), 'latin1');
    let text: string;
    try {
      text = zlib.inflateSync(chunk).toString('latin1');
    } catch {
      continue;
    }
    if (!text.includes('Tf')) continue;
    console.log('--- content stream ---');
    console.log(text.replace(/\r/g, '\n'));
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
