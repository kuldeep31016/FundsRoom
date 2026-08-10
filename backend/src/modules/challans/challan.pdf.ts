import PDFDocument from 'pdfkit';
import { env } from '../../config/env';
import type { ChallanItemRecord, ChallanRecord } from '../../types/domain';

/**
 * Renders a sales challan as a printable A4 PDF.
 *
 * The document is built entirely from the challan's own stored data — including
 * the per-line product snapshot — so a challan downloaded today and the same one
 * downloaded next year are identical, even if the product catalogue has changed
 * in between.
 *
 * The whole document is buffered before it is sent. Streaming straight to the
 * response would commit the status line and headers before rendering finishes,
 * leaving no way to return a clean JSON error if generation failed halfway.
 */

const PAGE_MARGIN = 44;
const A4_WIDTH = 595.28;
const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2;

// Colours mirror the web UI so the printed document looks like the same product.
const INK = '#14213d';
const MUTED = '#5b6785';
const RULE = '#d7dce6';
const ACCENT = '#2f5bc4';

const STATUS_COLOURS: Record<string, { fill: string; text: string }> = {
  DRAFT: { fill: '#fdf3e0', text: '#94620d' },
  CONFIRMED: { fill: '#e7f6ed', text: '#196c3a' },
  CANCELLED: { fill: '#fdeaea', text: '#a02323' },
};

/**
 * PDFKit's standard fonts use WinAnsi encoding, which has no code point for the
 * rupee sign, so "Rs." is used rather than emitting a broken glyph.
 */
function money(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

interface Column {
  label: string;
  width: number;
  align: 'left' | 'right';
}

const COLUMNS: Column[] = [
  { label: '#', width: 24, align: 'left' },
  { label: 'Product', width: 205, align: 'left' },
  { label: 'Location', width: 96, align: 'left' },
  { label: 'Unit price', width: 78, align: 'right' },
  { label: 'Qty', width: 40, align: 'right' },
  { label: 'Amount', width: 64, align: 'right' },
];

function columnX(index: number): number {
  return PAGE_MARGIN + COLUMNS.slice(0, index).reduce((sum, column) => sum + column.width, 0);
}

export function buildChallanPdf(
  challan: ChallanRecord,
  items: ChallanItemRecord[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: `Sales Challan ${challan.challan_number}`,
        Author: env.COMPANY_NAME,
        Subject: `Delivery challan for ${challan.customer_name ?? 'customer'}`,
        Creator: 'Mini ERP + CRM Operations Portal',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      renderDocument(doc, challan, items);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Failed to render the challan PDF'));
    }
  });
}

function renderDocument(
  doc: PDFKit.PDFDocument,
  challan: ChallanRecord,
  items: ChallanItemRecord[],
): void {
  renderLetterhead(doc, challan);
  renderParties(doc, challan);
  const tableEndY = renderItems(doc, items);
  renderTotals(doc, challan, tableEndY);
  renderNotes(doc, challan);
  renderSignatures(doc);
  // Watermark and footers run last so they can be applied to every buffered
  // page without disturbing the flow position used by the sections above.
  if (challan.status !== 'CONFIRMED') {
    renderWatermarks(doc, challan.status === 'DRAFT' ? 'DRAFT' : 'CANCELLED');
  }
  renderPageFooters(doc, challan);
}

/** Company letterhead on the left, document identity on the right. */
function renderLetterhead(doc: PDFKit.PDFDocument, challan: ChallanRecord): void {
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(env.COMPANY_NAME, PAGE_MARGIN, PAGE_MARGIN, { width: 300 });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(env.COMPANY_ADDRESS, PAGE_MARGIN, doc.y + 2, { width: 260 })
    .text(`GSTIN: ${env.COMPANY_GSTIN}`, { width: 260 })
    .text(`${env.COMPANY_PHONE}  |  ${env.COMPANY_EMAIL}`, { width: 260 });

  const rightX = PAGE_MARGIN + CONTENT_WIDTH - 200;
  doc
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor(INK)
    .text('DELIVERY CHALLAN', rightX, PAGE_MARGIN, { width: 200, align: 'right' });

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(ACCENT)
    .text(challan.challan_number, rightX, doc.y + 3, { width: 200, align: 'right' });

  // Status pill, right-aligned under the challan number.
  const status = challan.status;
  const colours = STATUS_COLOURS[status] ?? STATUS_COLOURS.DRAFT!;
  doc.font('Helvetica-Bold').fontSize(8);
  const pillWidth = doc.widthOfString(status) + 16;
  const pillX = PAGE_MARGIN + CONTENT_WIDTH - pillWidth;
  const pillY = doc.y + 4;
  doc.roundedRect(pillX, pillY, pillWidth, 15, 7.5).fill(colours.fill);
  doc.fillColor(colours.text).text(status, pillX, pillY + 4, { width: pillWidth, align: 'center' });

  const ruleY = Math.max(doc.y, pillY + 15) + 12;
  doc.moveTo(PAGE_MARGIN, ruleY).lineTo(PAGE_MARGIN + CONTENT_WIDTH, ruleY).lineWidth(1).stroke(RULE);
  doc.y = ruleY + 14;
}

/**
 * Diagonal watermark on every page, so an unconfirmed or void document can
 * never be mistaken for a real dispatch note.
 *
 * Drawn as a final pass over the buffered pages: writing it inline would move
 * the flow cursor and push the body content down the page.
 */
function renderWatermarks(doc: PDFKit.PDFDocument, label: string): void {
  const colour = STATUS_COLOURS[label === 'DRAFT' ? 'DRAFT' : 'CANCELLED']!.text;
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.save();
    doc.rotate(-30, { origin: [A4_WIDTH / 2, 430] });
    doc
      .font('Helvetica-Bold')
      .fontSize(88)
      .fillColor(colour)
      .opacity(0.07)
      .text(label, 0, 390, { width: A4_WIDTH, align: 'center', lineBreak: false });
    doc.opacity(1).restore();
  }
}

/** "Deliver to" and "Challan details" side by side. */
function renderParties(doc: PDFKit.PDFDocument, challan: ChallanRecord): void {
  const top = doc.y;
  const columnWidth = CONTENT_WIDTH / 2 - 12;
  const rightX = PAGE_MARGIN + CONTENT_WIDTH / 2 + 12;

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(MUTED)
    .text('DELIVER TO', PAGE_MARGIN, top, { width: columnWidth, characterSpacing: 0.6 });

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INK)
    .text(challan.customer_name ?? '-', PAGE_MARGIN, doc.y + 3, { width: columnWidth });

  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  if (challan.customer_business_name) {
    doc.text(challan.customer_business_name, { width: columnWidth });
  }
  if (challan.customer_mobile) {
    doc.text(`Mobile: ${challan.customer_mobile}`, { width: columnWidth });
  }
  const leftBottom = doc.y;

  const details: Array<[string, string]> = [
    ['Challan number', challan.challan_number],
    ['Date', formatDateTime(challan.created_at)],
    ['Status', challan.status],
    ['Prepared by', challan.created_by_name ?? '-'],
  ];
  if (challan.confirmed_at) {
    details.push(['Confirmed', `${formatDateTime(challan.confirmed_at)}${challan.confirmed_by_name ? ` by ${challan.confirmed_by_name}` : ''}`]);
  }
  if (challan.cancelled_at) {
    details.push(['Cancelled', `${formatDateTime(challan.cancelled_at)}${challan.cancelled_by_name ? ` by ${challan.cancelled_by_name}` : ''}`]);
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(MUTED)
    .text('CHALLAN DETAILS', rightX, top, { width: columnWidth, characterSpacing: 0.6 });

  let y = doc.y + 3;
  for (const [label, value] of details) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${label}:`, rightX, y, { width: 82 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(INK)
      .text(value, rightX + 86, y, { width: columnWidth - 86 });
    y = doc.y + 2;
  }

  doc.y = Math.max(leftBottom, y) + 16;
}

function renderTableHeader(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 20).fill('#f4f6fa');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);

  COLUMNS.forEach((column, index) => {
    doc.text(column.label.toUpperCase(), columnX(index) + 5, y + 6.5, {
      width: column.width - 10,
      align: column.align,
      characterSpacing: 0.4,
    });
  });

  doc.y = y + 20;
}

/**
 * Renders the line items, paginating when the page fills. Values come from the
 * per-line snapshot, not from the live product record.
 */
function renderItems(doc: PDFKit.PDFDocument, items: ChallanItemRecord[]): number {
  renderTableHeader(doc);
  const bottomLimit = 700; // leave room for totals, signatures and the footer

  items.forEach((item, index) => {
    const nameHeight = doc.font('Helvetica-Bold').fontSize(9).heightOfString(item.product_name, {
      width: COLUMNS[1]!.width - 10,
    });
    const rowHeight = Math.max(nameHeight + 14, 30);

    if (doc.y + rowHeight > bottomLimit) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
      renderTableHeader(doc);
    }

    const y = doc.y;
    if (index % 2 === 1) {
      doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight).fill('#fafbfd');
    }

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(String(index + 1), columnX(0) + 5, y + 7, { width: COLUMNS[0]!.width - 10 });

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(INK)
      .text(item.product_name, columnX(1) + 5, y + 7, { width: COLUMNS[1]!.width - 10 });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `SKU ${item.product_sku}${item.product_category ? `  |  ${item.product_category}` : ''}`,
        columnX(1) + 5,
        doc.y + 1,
        { width: COLUMNS[1]!.width - 10 },
      );

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(item.product_location ?? '-', columnX(2) + 5, y + 7, { width: COLUMNS[2]!.width - 10 });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text(money(item.unit_price), columnX(3) + 5, y + 7, {
        width: COLUMNS[3]!.width - 10,
        align: 'right',
      })
      .font('Helvetica-Bold')
      .text(String(item.quantity), columnX(4) + 5, y + 7, {
        width: COLUMNS[4]!.width - 10,
        align: 'right',
      })
      .font('Helvetica')
      .text(money(item.line_total), columnX(5) + 5, y + 7, {
        width: COLUMNS[5]!.width - 10,
        align: 'right',
      });

    const rowBottom = y + rowHeight;
    doc
      .moveTo(PAGE_MARGIN, rowBottom)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, rowBottom)
      .lineWidth(0.5)
      .stroke(RULE);
    doc.y = rowBottom;
  });

  return doc.y;
}

function renderTotals(doc: PDFKit.PDFDocument, challan: ChallanRecord, tableEndY: number): void {
  const boxWidth = 220;
  const boxX = PAGE_MARGIN + CONTENT_WIDTH - boxWidth;
  const y = tableEndY + 12;

  doc.rect(boxX, y, boxWidth, 52).fill('#f4f6fa');

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('Total quantity', boxX + 12, y + 10, { width: 110 })
    .font('Helvetica-Bold')
    .fillColor(INK)
    .text(String(challan.total_quantity), boxX + 122, y + 10, { width: boxWidth - 134, align: 'right' });

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(MUTED)
    .text('Total value', boxX + 12, y + 30, { width: 110 })
    .fontSize(12)
    .fillColor(INK)
    .text(money(challan.total_amount), boxX + 122, y + 28, {
      width: boxWidth - 134,
      align: 'right',
    });

  doc.y = y + 52;
}

function renderNotes(doc: PDFKit.PDFDocument, challan: ChallanRecord): void {
  const note = challan.status === 'CANCELLED' ? challan.cancellation_reason : challan.notes;
  if (!note) return;

  const label = challan.status === 'CANCELLED' ? 'CANCELLATION REASON' : 'NOTES';
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(MUTED)
    .text(label, PAGE_MARGIN, doc.y + 14, { width: CONTENT_WIDTH, characterSpacing: 0.6 })
    .font('Helvetica')
    .fontSize(9)
    .fillColor(INK)
    .text(note, PAGE_MARGIN, doc.y + 3, { width: CONTENT_WIDTH - 240 });
}

function renderSignatures(doc: PDFKit.PDFDocument): void {
  // Anchored above the footer, but never overlapping the content above it.
  const y = Math.min(Math.max(doc.y + 46, 700), 745);
  const lineWidth = 170;

  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + lineWidth, y).lineWidth(0.5).stroke(RULE);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text('Receiver signature', PAGE_MARGIN, y + 5, { width: lineWidth });

  const rightX = PAGE_MARGIN + CONTENT_WIDTH - lineWidth;
  doc.moveTo(rightX, y).lineTo(rightX + lineWidth, y).stroke(RULE);
  doc.text(`For ${env.COMPANY_NAME}`, rightX, y + 5, { width: lineWidth, align: 'right' });
}

/** Footer with page numbers, applied to every buffered page. */
function renderPageFooters(doc: PDFKit.PDFDocument, challan: ChallanRecord): void {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const y = 800;

    // The footer sits below the normal text area; without this PDFKit would
    // treat it as an overflow and spill onto a new blank page.
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .moveTo(PAGE_MARGIN, y - 8)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y - 8)
      .lineWidth(0.5)
      .stroke(RULE);

    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `${challan.challan_number}  |  Computer-generated document  |  Generated ${formatDateTime(new Date())}`,
        PAGE_MARGIN,
        y,
        { width: CONTENT_WIDTH - 60, lineBreak: false },
      )
      .text(`Page ${index + 1} of ${range.count}`, PAGE_MARGIN + CONTENT_WIDTH - 60, y, {
        width: 60,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.bottom = originalBottomMargin;
  }
}
