#!/usr/bin/env node
/**
 * Build the 5 golden-set fixture PDFs from the markdown sources in fixtures/sources/.
 *
 * Usage:
 *   node scripts/build-fixtures.mjs
 *
 * Produces:
 *   fixtures/paper-attention.pdf
 *   fixtures/manual-product.pdf
 *   fixtures/report-financial.pdf
 *   fixtures/doc-legal-tos.pdf
 *   fixtures/doc-spanish.pdf
 *
 * The PDFs are gitignored (see root .gitignore). The markdown sources are
 * committed and are the source of truth — regenerate any time the content
 * of the golden set evolves.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const SOURCES_DIR = join(FIXTURES_DIR, 'sources');

const SOURCES = [
  { md: 'paper-attention.md', pdf: 'paper-attention.pdf' },
  { md: 'manual-product.md', pdf: 'manual-product.pdf' },
  { md: 'report-financial.md', pdf: 'report-financial.pdf' },
  { md: 'doc-legal-tos.md', pdf: 'doc-legal-tos.pdf' },
  { md: 'doc-spanish.md', pdf: 'doc-spanish.pdf' },
];

const FONT_REGULAR = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const FONT_ITALIC = 'Helvetica-Oblique';
const FONT_MONO = 'Courier';

function renderMarkdownToPdf(markdown, outPath) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: {
      Producer: 'DocAI fixture builder',
      Creator: 'DocAI fixture builder',
    },
  });

  doc.pipe(writeStreamToFile(outPath));

  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H1
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      doc.moveDown(0.3);
      doc.font(FONT_BOLD).fontSize(20).text(line.slice(2), { paragraphGap: 6 });
      doc.moveDown(0.4);
      i++;
      continue;
    }

    // H2
    if (line.startsWith('## ')) {
      doc.moveDown(0.6);
      doc.font(FONT_BOLD).fontSize(15).text(line.slice(3), { paragraphGap: 4 });
      doc.moveDown(0.25);
      i++;
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      doc.moveDown(0.4);
      doc.font(FONT_BOLD).fontSize(12).text(line.slice(4), { paragraphGap: 3 });
      doc.moveDown(0.2);
      i++;
      continue;
    }

    // Bold metadata line at top of doc: **Key:** value
    if (line.startsWith('**') && line.includes(':**')) {
      const inner = line;
      // strip ** ... ** wrapping piece by piece
      doc.font(FONT_BOLD).fontSize(10);
      const parts = inner.split(/\*\*/);
      // parts: ['', 'Key:', ' value', ...] for "**Key:** value"
      let x = doc.x;
      const y = doc.y;
      let isBold = false;
      const out = [];
      for (const part of parts) {
        if (part.length === 0) {
          isBold = !isBold;
          continue;
        }
        out.push({ text: part, bold: isBold });
        isBold = !isBold;
      }
      // simple: just render as a single italic-meta line
      doc.font(FONT_ITALIC).fontSize(10).fillColor('#444');
      const joined = out.map((p) => p.text).join('');
      doc.text(joined, { paragraphGap: 2 });
      doc.fillColor('#000');
      i++;
      continue;
    }

    // Table: a line starting with | and the next line also a | with --- (separator)
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1])) {
      const tableLines = [line];
      i += 2; // skip separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      renderTable(doc, tableLines);
      doc.moveDown(0.5);
      continue;
    }

    // Unordered list
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ''));
        i++;
      }
      doc.font(FONT_REGULAR).fontSize(11);
      for (const item of items) {
        doc.text('• ' + stripInlineMarkdown(item), { indent: 18, paragraphGap: 2 });
      }
      doc.moveDown(0.3);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(\d+)\.\s+/, '$1. '));
        i++;
      }
      doc.font(FONT_REGULAR).fontSize(11);
      for (const item of items) {
        doc.text(stripInlineMarkdown(item), { indent: 18, paragraphGap: 2 });
      }
      doc.moveDown(0.3);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Default: paragraph (collect multi-line until empty)
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].trim().startsWith('|') && !/^\s*-\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    doc.font(FONT_REGULAR).fontSize(11);
    doc.text(stripInlineMarkdown(para.join(' ')), { paragraphGap: 4, align: 'left' });
    doc.moveDown(0.2);
  }

  doc.end();
}

function renderTable(doc, tableLines) {
  // Parse rows
  const rows = tableLines.map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim()),
  );

  if (rows.length === 0) return;

  const cols = rows[0].length;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / cols;

  doc.font(FONT_REGULAR).fontSize(9);
  const lineHeight = 14;
  const cellPadding = 4;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isHeader = r === 0;
    doc.font(isHeader ? FONT_BOLD : FONT_REGULAR).fontSize(9);

    const startY = doc.y;

    // Compute max height for this row (cells might wrap)
    let rowHeight = lineHeight;
    for (let c = 0; c < cols; c++) {
      const cellText = stripInlineMarkdown(row[c] || '');
      const h = doc.heightOfString(cellText, { width: colWidth - cellPadding * 2 });
      if (h + cellPadding * 2 > rowHeight) rowHeight = h + cellPadding * 2;
    }

    // Check page break
    if (startY + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }

    const y = doc.y;

    // Draw cell text
    for (let c = 0; c < cols; c++) {
      const cellText = stripInlineMarkdown(row[c] || '');
      const x = doc.page.margins.left + c * colWidth;
      doc.text(cellText, x + cellPadding, y + cellPadding, {
        width: colWidth - cellPadding * 2,
        align: 'left',
      });
    }

    // Draw row border
    doc
      .moveTo(doc.page.margins.left, y + rowHeight)
      .lineTo(doc.page.margins.left + pageWidth, y + rowHeight)
      .strokeColor('#aaa')
      .lineWidth(0.5)
      .stroke();

    doc.y = y + rowHeight;
  }

  // Reset cursor + cached lineWrap width after the table.
  // pdfkit caches options.width from the last text() call; the positional
  // text() inside cells leaves the cursor at the last column's x and the
  // lineWrap at the column width. Force a fresh text-flow state by issuing
  // a zero-content text() at the left margin with full page width.
  doc.x = doc.page.margins.left;
  doc.text(' ', doc.page.margins.left, doc.y, {
    width: pageWidth,
    lineBreak: false,
    continued: false,
    paragraphGap: 0,
  });
}

function stripInlineMarkdown(text) {
  // Strip ** ... ** bold markers and * ... * italic markers; keep underlying text.
  // Also strip backticks for inline code, leaving the content.
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*(.+?)\*/g, '$1');
}

function writeStreamToFile(path) {
  // pdfkit's doc.pipe expects a Writable. Use Node fs.createWriteStream.
  return import('node:fs').then((fs) => fs.createWriteStream(path));
}

// Run

async function main() {
  if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });

  const fs = await import('node:fs');

  for (const { md, pdf } of SOURCES) {
    const mdPath = join(SOURCES_DIR, md);
    const pdfPath = join(FIXTURES_DIR, pdf);
    const markdown = readFileSync(mdPath, 'utf-8');

    console.log(`Building ${pdf} from ${md} ...`);

    // Render synchronously with file stream
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: { Producer: 'DocAI fixture builder', Creator: 'DocAI fixture builder' },
    });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Inlined render (synchronous-style)
    renderInline(doc, markdown);
    doc.end();

    await new Promise((res, rej) => {
      stream.on('finish', res);
      stream.on('error', rej);
    });

    console.log(`  → ${pdf} (${fs.statSync(pdfPath).size.toLocaleString()} bytes)`);
  }

  console.log('\nDone. 5 PDFs ready in packages/evals/fixtures/');
}

function renderInline(doc, markdown) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ') && !line.startsWith('## ')) {
      doc.moveDown(0.3);
      doc.font(FONT_BOLD).fontSize(20).fillColor('#000').text(stripInlineMarkdown(line.slice(2)), { width: pageWidth, paragraphGap: 6 });
      doc.moveDown(0.4);
      i++;
      continue;
    }

    if (line.startsWith('## ')) {
      doc.moveDown(0.6);
      doc.font(FONT_BOLD).fontSize(15).text(stripInlineMarkdown(line.slice(3)), { width: pageWidth, paragraphGap: 4 });
      doc.moveDown(0.25);
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      doc.moveDown(0.4);
      doc.font(FONT_BOLD).fontSize(12).text(stripInlineMarkdown(line.slice(4)), { width: pageWidth, paragraphGap: 3 });
      doc.moveDown(0.2);
      i++;
      continue;
    }

    if (line.startsWith('**') && line.includes(':**')) {
      doc.font(FONT_ITALIC).fontSize(10).fillColor('#444').text(stripInlineMarkdown(line), { width: pageWidth, paragraphGap: 2 });
      doc.fillColor('#000');
      i++;
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1])) {
      const tableLines = [line];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      renderTable(doc, tableLines);
      doc.moveDown(0.5);
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ''));
        i++;
      }
      doc.font(FONT_REGULAR).fontSize(11);
      for (const item of items) {
        doc.text('• ' + stripInlineMarkdown(item), { width: pageWidth, indent: 18, paragraphGap: 2 });
      }
      doc.moveDown(0.3);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(\d+)\.\s+/, '$1. '));
        i++;
      }
      doc.font(FONT_REGULAR).fontSize(11);
      for (const item of items) {
        doc.text(stripInlineMarkdown(item), { width: pageWidth, indent: 18, paragraphGap: 2 });
      }
      doc.moveDown(0.3);
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].trim().startsWith('|') &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    doc.font(FONT_REGULAR).fontSize(11);
    doc.text(stripInlineMarkdown(para.join(' ')), { width: pageWidth, paragraphGap: 4, align: 'left' });
    doc.moveDown(0.2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
