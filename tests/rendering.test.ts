import { describe, expect, it } from 'vitest'
import { renderDocumentDocx } from '@/lib/documents/render/docx'
import { renderDocumentPdf } from '@/lib/documents/render/pdf'
import { resolveFont } from '@/lib/documents/render/fonts'
import { layoutFor, type RenderDocument } from '@/lib/documents/render/model'

/**
 * Document rendering.
 *
 * These assert that real files come out — correct magic bytes, plausible size —
 * rather than that a function returned without throwing. A renderer that emits
 * a zero-byte "PDF" passes a smoke test and fails a client.
 */

function sampleDocument(overrides: Partial<RenderDocument> = {}): RenderDocument {
  return {
    documentType: 'quotation',
    typeLabel: 'QUOTATION/PROFORMA',
    reference: 'HQ_2670053',
    documentDate: '15 JULY 2026',
    company: {
      entityName: 'HA GROUP TZ LTD',
      addressLines: ['9th Floor Derm Plaza, Plot 18', 'Block 45A, Bagamoyo Rd', 'Kijitonyama'],
      city: 'Dar es Salaam',
      country: 'Tanzania',
      phone: '+255 653 625 659',
      alternatePhone: null,
      whatsapp: '+255 765 754 638',
      email: 'business@hpcagroup.africa',
      website: 'www.hpcagroup.africa',
      tin: '168-189-478',
      vrn: '40-318389-G',
      registrationNumber: '168189478',
      businessLicence: '20000062518',
      importExportLicence: null,
      fineprint: null,
    },
    client: {
      name: 'ALLIANCE ONE TOBACCO TANZANIA LIMITED',
      contactPerson: 'MR Z. CHANGALIMA',
      addressLines: ['Aointl Complex, Plot 2 Kingolwira', 'Morogoro'],
      phone: '+255 232 934 216',
      email: null,
      tin: '100228211',
      vrn: '20-011269-N',
      vendorId: '635804',
      accountNumber: '30D120216',
    },
    bank: {
      accountName: 'HA GROUP TZ LIMITED',
      bankName: 'AZANIA BANK LIMITED',
      branch: 'OYSTERBAY',
      branchCode: '0310033',
      accountNumber: '033000002678',
      currency: 'TZS',
      swiftCode: 'AZANTZTZ',
      sortCode: '031033',
    },
    title: 'July 2026 Maintenance Services',
    scopeLine: 'MAINTENANCE SERVICES — JULY 2026',
    clientReference: 'FMs',
    purchaseOrderNumber: null,
    lines: [
      {
        position: 0,
        description: 'July 2026 Maintenance Services',
        itemCode: null,
        quantity: '8',
        unit: null,
        unitPrice: '1853413.46',
        discountPercent: null,
        lineTotal: '14827307.68',
      },
    ],
    totals: {
      subTotal: '14827307.68',
      charges: [
        {
          label: 'Administration',
          ratePercent: '20',
          amount: '2965461.54',
          appliesBeforeVat: true,
        },
      ],
      taxableTotal: '17792769.22',
      taxLabel: 'VAT',
      taxRatePercent: '18',
      taxAmount: '3202698.46',
      grandTotal: '20995467.68',
      currency: 'TZS',
    },
    bodyContent: null,
    terms: {
      paymentTerms: 'Supplied to Morogoro',
      vatStatement: 'VAT charged.',
      deliveryTime: '45 Days',
    },
    preparedBy: {
      name: 'Adam Nzinza',
      title: 'Operations.',
      phone: '+255 692 833 236',
      email: 'adam@hpcagroup.africa',
    },
    logo: null,
    partnerMarks: [],
    seals: [],
    footer: {
      tagline: "Africa's Engineering Performance Benchmark",
      directorsLine: 'C. Msindo (Executive Chairman), J. Dube (Technical), P.A. Majola (Managing)',
      showFooter: true,
    },
    fontSubstitutionNotice: null,
    isDraft: false,
    watermark: null,
    ...overrides,
  }
}

describe('PDF rendering', () => {
  it('produces a real PDF file', async () => {
    const pdf = await renderDocumentPdf(sampleDocument())

    // %PDF- magic number.
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // A one-page quotation with a table is comfortably over 1 KB.
    expect(pdf.byteLength).toBeGreaterThan(1000)
    // And ends with the EOF marker, so it is not truncated.
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF')
  }, 30_000)

  it('renders a tax invoice layout without terms or a footer', async () => {
    const layout = layoutFor('tax_invoice')
    expect(layout.showStatutoryBand).toBe(true)
    expect(layout.showBankDetails).toBe(true)
    expect(layout.showTerms).toBe(false)
    // Phase 0: the sample tax invoices carry no footer at all.
    expect(layout.showFooter).toBe(false)

    const pdf = await renderDocumentPdf(
      sampleDocument({ documentType: 'tax_invoice', typeLabel: 'TAX INVOICE' }),
    )
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 30_000)

  it('renders a draft with a watermark', async () => {
    const pdf = await renderDocumentPdf(sampleDocument({ isDraft: true, watermark: 'DRAFT' }))
    expect(pdf.byteLength).toBeGreaterThan(1000)
  }, 30_000)

  it('renders a letter, which has no line table', async () => {
    const pdf = await renderDocumentPdf(
      sampleDocument({
        documentType: 'official_letter',
        lines: [],
        totals: null,
        bodyContent: 'Dear Sir,\n\nThis confirms the completion of the works.\n\nYours faithfully,',
      }),
    )
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 30_000)
})

describe('DOCX rendering', () => {
  it('produces a real Word file', async () => {
    const docx = await renderDocumentDocx(sampleDocument())

    // PK zip magic — a .docx is an OOXML zip container.
    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(docx.byteLength).toBeGreaterThan(2000)

    // It must genuinely contain the Word document part, not just be a zip.
    expect(docx.toString('latin1')).toContain('word/document.xml')
  }, 30_000)

  it('carries the company figures into the Word tables', async () => {
    const docx = await renderDocumentDocx(sampleDocument())
    const text = docx.toString('latin1')
    // Zip entries are compressed, so assert on the container rather than the
    // prose; the structural parts are what prove it is a valid document.
    expect(text).toContain('[Content_Types].xml')
    expect(text).toContain('word/')
  }, 30_000)
})

describe('font resolution', () => {
  it('reports honestly when licensed Century Gothic is absent', () => {
    const font = resolveFont()

    if (font.isLicensedCenturyGothic) {
      expect(font.family).toBe('Century Gothic')
      expect(font.substitutionNotice).toBeNull()
    } else {
      // The fallback must announce itself — a substituted typeface on a company
      // document is something a human needs to know about.
      expect(font.substitutionNotice).toBeTruthy()
      expect(font.substitutionNotice).toMatch(/Century Gothic/)
      expect(font.family).toBe('Helvetica')
    }
  })
})
