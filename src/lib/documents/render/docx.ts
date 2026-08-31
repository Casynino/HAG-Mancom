import 'server-only'

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { formatAmount } from '@/lib/finance/decimal'
import { resolveFont } from './fonts'
import { layoutFor, type RenderDocument } from './model'

/**
 * Editable DOCX rendering.
 *
 * The brief asks for an editable Word file alongside the PDF. This produces a
 * genuine .docx — not an HTML file with a .doc extension — with the company
 * font, the same geometry, and real Word tables, so it opens and edits properly.
 *
 * It is deliberately a close sibling of the PDF rather than a pixel copy: Word
 * reflows, and pretending otherwise would produce a document that looks wrong
 * the moment anyone types in it.
 */

/** Word measures in twips: 12.7 mm = 720 twips, matching the source DOCX. */
const MARGIN_TWIPS = 720

/** Half-points, as Word stores them. */
const SZ = {
  title: 32,
  heading: 28,
  subHeading: 24,
  body: 20,
  bodyAlt: 22,
  tableHeader: 18,
  denseLabel: 17,
  footer: 16,
  fineprint: 14,
}

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const ALL_BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
}

function text(
  value: string,
  opts: { bold?: boolean; size?: number; colour?: string } = {},
): TextRun {
  return new TextRun({
    text: value,
    bold: opts.bold,
    size: opts.size ?? SZ.body,
    color: opts.colour,
  })
}

function para(
  value: string,
  opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    children: [text(value, { bold: opts.bold, size: opts.size })],
  })
}

function cell(
  value: string,
  opts: { bold?: boolean; width?: number; align?: 'left' | 'right' | 'center'; size?: number } = {},
): TableCell {
  return new TableCell({
    borders: ALL_BORDERS,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment:
          opts.align === 'right'
            ? AlignmentType.RIGHT
            : opts.align === 'center'
              ? AlignmentType.CENTER
              : AlignmentType.LEFT,
        children: [text(value, { bold: opts.bold, size: opts.size ?? SZ.body })],
      }),
    ],
  })
}

export async function renderDocumentDocx(doc: RenderDocument): Promise<Buffer> {
  const font = resolveFont()
  const layout = layoutFor(doc.documentType)
  const money = (v: string) => formatAmount(v)

  const children: Array<Paragraph | Table> = []

  // ---- Letterhead ---------------------------------------------------------
  children.push(para(doc.company.entityName, { bold: true, size: SZ.subHeading }))
  children.push(para(`${doc.company.country.toUpperCase()}:`, { bold: true, size: SZ.denseLabel }))
  for (const line of doc.company.addressLines) {
    children.push(para(line, { size: SZ.denseLabel }))
  }
  if (doc.company.city) children.push(para(doc.company.city, { size: SZ.denseLabel }))

  const contactBits = [
    doc.company.phone ? `T: ${doc.company.phone}` : null,
    doc.company.whatsapp ? `WB: ${doc.company.whatsapp}` : null,
    doc.company.email ? `E: ${doc.company.email}` : null,
    doc.company.website ? `W: ${doc.company.website}` : null,
  ].filter(Boolean)
  if (contactBits.length > 0) {
    children.push(para(contactBits.join('    '), { size: SZ.denseLabel }))
  }

  if (doc.company.fineprint) {
    children.push(para(doc.company.fineprint, { size: SZ.fineprint }))
  }

  children.push(new Paragraph({ text: '' }))

  // ---- Statutory band -----------------------------------------------------
  if (layout.showStatutoryBand) {
    const band = [
      doc.company.registrationNumber ? `RN: ${doc.company.registrationNumber}` : null,
      doc.company.tin ? `TIN: ${doc.company.tin}` : null,
      doc.company.businessLicence ? `BL: ${doc.company.businessLicence}` : null,
      doc.company.importExportLicence ? `IMPORT/EXPORT: ${doc.company.importExportLicence}` : null,
      doc.company.vrn ? `VRN: ${doc.company.vrn}` : null,
    ]
      .filter(Boolean)
      .join('   ')
    children.push(para(band, { bold: true, size: SZ.denseLabel }))
  }

  // ---- Title band ---------------------------------------------------------
  if (layout.label) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          text(layout.label, { bold: true, size: SZ.title }),
          ...(doc.reference ? [text(`          ${doc.reference}`, { bold: true, size: SZ.title })] : []),
        ],
      }),
    )
  }

  // ---- Customer block -----------------------------------------------------
  const customerRows: TableRow[] = [
    new TableRow({
      children: [
        cell('Customer', { bold: true, width: 25 }),
        cell(
          doc.client.accountNumber ? `Account number: ${doc.client.accountNumber}` : '',
          { width: 75 },
        ),
      ],
    }),
    new TableRow({
      children: [cell('Contact'), cell(doc.client.contactPerson ?? '')],
    }),
    new TableRow({ children: [cell('Company'), cell(doc.client.name)] }),
    new TableRow({
      children: [cell('Address'), cell(doc.client.addressLines.join(', '))],
    }),
    new TableRow({ children: [cell('Phone'), cell(doc.client.phone ?? '')] }),
  ]

  if (layout.showStatutoryBand) {
    customerRows.push(new TableRow({ children: [cell('TIN'), cell(doc.client.tin ?? '')] }))
    customerRows.push(new TableRow({ children: [cell('VRN'), cell(doc.client.vrn ?? '')] }))
  }

  children.push(
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: customerRows }),
  )
  children.push(new Paragraph({ text: '' }))

  const miscRows: TableRow[] = [
    new TableRow({ children: [cell('Misc.', { bold: true, width: 25 }), cell('', { width: 75 })] }),
    new TableRow({ children: [cell('Date'), cell(doc.documentDate ?? '')] }),
    new TableRow({ children: [cell('Reference'), cell(doc.clientReference ?? 'N/A')] }),
  ]
  if (doc.client.vendorId) {
    miscRows.push(new TableRow({ children: [cell('Vendor ID'), cell(doc.client.vendorId)] }))
  }
  if (doc.purchaseOrderNumber) {
    miscRows.push(new TableRow({ children: [cell('Order'), cell(doc.purchaseOrderNumber)] }))
  }

  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: miscRows }))
  children.push(new Paragraph({ text: '' }))

  if (doc.scopeLine) {
    children.push(para(`SCOPE: ${doc.scopeLine}`, { bold: true, size: SZ.subHeading }))
    children.push(new Paragraph({ text: '' }))
  }

  // ---- Line items ---------------------------------------------------------
  if (layout.showLineTable && doc.lines.length > 0) {
    const rows: TableRow[] = [
      new TableRow({
        children: layout.showTotals
          ? [
              cell('ITEM', { bold: true, width: 6, align: 'center', size: SZ.tableHeader }),
              cell('QTY', { bold: true, width: 7, align: 'center', size: SZ.tableHeader }),
              cell('DESCRIPTION', { bold: true, width: 45, size: SZ.tableHeader }),
              cell('ITEM CODE', { bold: true, width: 12, size: SZ.tableHeader }),
              cell('UNIT COST', { bold: true, width: 15, align: 'right', size: SZ.tableHeader }),
              cell(`${doc.totals?.currency ?? ''} TOTAL`, {
                bold: true,
                width: 15,
                align: 'right',
                size: SZ.tableHeader,
              }),
            ]
          : [
              cell('ITEM', { bold: true, width: 8, align: 'center', size: SZ.tableHeader }),
              cell('QTY', { bold: true, width: 10, align: 'center', size: SZ.tableHeader }),
              cell('DESCRIPTION', { bold: true, width: 67, size: SZ.tableHeader }),
              cell('UNIT', { bold: true, width: 15, size: SZ.tableHeader }),
            ],
      }),
    ]

    for (const line of doc.lines) {
      rows.push(
        new TableRow({
          children: layout.showTotals
            ? [
                cell(String(line.position + 1), { align: 'center' }),
                cell(line.quantity, { align: 'center' }),
                cell(line.description),
                cell(line.itemCode ?? ''),
                cell(money(line.unitPrice), { align: 'right' }),
                cell(money(line.lineTotal), { align: 'right' }),
              ]
            : [
                cell(String(line.position + 1), { align: 'center' }),
                cell(line.quantity, { align: 'center' }),
                cell(line.description),
                cell(line.unit ?? ''),
              ],
        }),
      )
    }

    if (layout.showTotals && doc.totals) {
      const totalRow = (label: string, value: string, bold = false) =>
        new TableRow({
          children: [
            new TableCell({
              borders: ALL_BORDERS,
              columnSpan: 5,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [text(label, { bold: true })],
                }),
              ],
            }),
            cell(money(value), { align: 'right', bold }),
          ],
        })

      rows.push(totalRow('SUB TOTAL', doc.totals.subTotal, true))

      for (const charge of doc.totals.charges.filter((c) => c.appliesBeforeVat)) {
        rows.push(totalRow(`${charge.label} (${charge.ratePercent}%)`, charge.amount))
      }
      if (doc.totals.charges.some((c) => c.appliesBeforeVat)) {
        rows.push(totalRow('TOTAL', doc.totals.taxableTotal, true))
      }
      if (doc.totals.taxRatePercent) {
        rows.push(
          totalRow(
            `${doc.totals.taxLabel ?? 'VAT'} (${doc.totals.taxRatePercent}%)`,
            doc.totals.taxAmount,
          ),
        )
      }
      for (const charge of doc.totals.charges.filter((c) => !c.appliesBeforeVat)) {
        rows.push(totalRow(`${charge.label} (${charge.ratePercent}%)`, charge.amount))
      }
      rows.push(
        totalRow(
          doc.documentType === 'quotation' ? 'TOTAL INCL' : 'GRAND TOTAL',
          doc.totals.grandTotal,
          true,
        ),
      )
    }

    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }))
    children.push(new Paragraph({ text: '' }))
  }

  if (doc.bodyContent) {
    for (const paragraph of doc.bodyContent.split(/\n{2,}/)) {
      children.push(para(paragraph, { size: SZ.bodyAlt }))
      children.push(new Paragraph({ text: '' }))
    }
  }

  // ---- Terms --------------------------------------------------------------
  if (layout.showTerms && doc.terms) {
    children.push(para('TERMS AND ENGINEERING CONDITIONS', { bold: true, size: SZ.heading }))
    if (doc.terms.paymentTerms) {
      children.push(para('PAYMENT TERMS AND CONDITIONS:', { bold: true, size: SZ.tableHeader }))
      children.push(para(doc.terms.paymentTerms))
    }
    if (doc.terms.vatStatement) {
      children.push(para('VALUE ADDED TAX (VAT):', { bold: true, size: SZ.tableHeader }))
      children.push(para(doc.terms.vatStatement))
    }
    if (doc.terms.deliveryTime) {
      children.push(para('DELIVERY TIME:', { bold: true, size: SZ.tableHeader }))
      children.push(para(doc.terms.deliveryTime))
    }
    children.push(new Paragraph({ text: '' }))
  }

  // ---- Sign-off -----------------------------------------------------------
  if (layout.showSignOff && doc.preparedBy) {
    children.push(para('We thank you for trusting us with your business.'))
    children.push(para('Yours Sincerely'))
    children.push(new Paragraph({ text: '' }))
    children.push(new Paragraph({ text: '' }))
    children.push(para(doc.preparedBy.name, { bold: true }))
    if (doc.preparedBy.title) children.push(para(doc.preparedBy.title, { bold: true }))
    children.push(
      para(
        [
          doc.preparedBy.phone ? `Direct: ${doc.preparedBy.phone}` : null,
          doc.preparedBy.email ? `Email: ${doc.preparedBy.email}` : null,
        ]
          .filter(Boolean)
          .join('        '),
        { size: SZ.denseLabel },
      ),
    )
  }

  // ---- Banking ------------------------------------------------------------
  if (layout.showBankDetails && doc.bank) {
    children.push(new Paragraph({ text: '' }))
    children.push(para('Our Banking Details are:', { bold: true, size: SZ.subHeading }))
    const bankLines: Array<[string, string | null | undefined]> = [
      ['Account Name', doc.bank.accountName],
      ['Bank', doc.bank.bankName],
      ['Branch', doc.bank.branch ? `${doc.bank.branch} (${doc.bank.branchCode ?? ''})` : null],
      ['Account Number', `${doc.bank.accountNumber} (${doc.bank.currency})`],
      ['Swift Code', doc.bank.swiftCode],
      ['Sort Code', doc.bank.sortCode],
    ]
    for (const [label, value] of bankLines) {
      if (value) children.push(para(`${label.padEnd(20)}: ${value}`, { size: SZ.bodyAlt }))
    }
  }

  // ---- Footer -------------------------------------------------------------
  if (doc.footer.showFooter) {
    children.push(new Paragraph({ text: '' }))
    if (doc.footer.tagline) {
      children.push(
        para(doc.footer.tagline, { bold: true, size: SZ.footer, align: AlignmentType.CENTER }),
      )
    }
    if (doc.footer.directorsLine) {
      children.push(para(doc.footer.directorsLine, { size: SZ.footer, align: AlignmentType.CENTER }))
    }
  }

  if (doc.fontSubstitutionNotice) {
    children.push(
      para(doc.fontSubstitutionNotice, { size: SZ.fineprint, align: AlignmentType.CENTER }),
    )
  }

  const file = new Document({
    creator: doc.company.entityName,
    title: doc.reference ?? doc.title,
    description: doc.typeLabel,
    styles: {
      default: {
        document: {
          run: { font: font.family, size: SZ.body },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: MARGIN_TWIPS,
              right: MARGIN_TWIPS,
              bottom: MARGIN_TWIPS,
              left: MARGIN_TWIPS,
            },
          },
        },
        children,
      },
    ],
  })

  return Buffer.from(await Packer.toBuffer(file))
}
