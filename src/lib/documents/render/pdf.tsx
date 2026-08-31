import 'server-only'

import React from 'react'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatAmount } from '@/lib/finance/decimal'
import { resolveFont } from './fonts'
import { layoutFor, type RenderDocument } from './model'

/**
 * Server-side PDF rendering.
 *
 * The layout follows the geometry Phase 0 measured from HA GROUP's own
 * documents: A4, 12.7 mm margins on all four sides, 0.5 pt black table rules,
 * no cell shading, and the type scale from the source DOCX — 16 pt for the
 * document title, 9 pt for table headers, 10–11 pt body, 7 pt for the
 * multi-country band.
 *
 * @react-pdf rather than headless Chrome because this deploys to Vercel, where
 * a bundled browser binary is a recurring source of breakage. The trade is that
 * layout is expressed in a flexbox subset rather than full CSS, which is why
 * the table below is built from Views rather than an HTML table.
 */

let fontsRegistered = false

function ensureFonts() {
  if (fontsRegistered) return
  const choice = resolveFont()

  if (choice.isLicensedCenturyGothic && choice.files.regular) {
    const variants: Array<{
      src: string
      fontWeight?: 'normal' | 'bold'
      fontStyle?: 'italic'
    }> = [{ src: choice.files.regular, fontWeight: 'normal' }]
    if (choice.files.bold) variants.push({ src: choice.files.bold, fontWeight: 'bold' })
    if (choice.files.italic) variants.push({ src: choice.files.italic, fontStyle: 'italic' })

    Font.register({ family: 'Century Gothic', fonts: variants })
  }

  // Keeps long client names and references from overflowing their cells.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

/** Point sizes measured from the source DOCX. */
const PT = {
  title: 16,
  heading: 14,
  subHeading: 12,
  body: 10,
  bodyAlt: 11,
  tableHeader: 9,
  denseLabel: 8.5,
  footer: 8,
  fineprint: 7,
}

const COLOURS = {
  ink: '#000000',
  secondary: '#595959',
  rule: '#000000',
  draft: '#B3261E',
}

function buildStyles(family: string) {
  return StyleSheet.create({
    page: {
      fontFamily: family,
      fontSize: PT.body,
      color: COLOURS.ink,
      // 12.7 mm = 36 pt, the margin measured on every side of the original.
      paddingTop: 36,
      paddingBottom: 36,
      paddingLeft: 36,
      paddingRight: 36,
    },

    letterhead: { flexDirection: 'row', marginBottom: 6 },
    logoColumn: { width: 130, paddingRight: 10 },
    logo: { width: 120, objectFit: 'contain' },
    entityName: { fontSize: PT.denseLabel, fontWeight: 'bold', marginTop: 4 },
    addressColumn: { flex: 1 },
    addressHeading: { fontSize: PT.denseLabel, fontWeight: 'bold' },
    addressLine: { fontSize: PT.denseLabel, lineHeight: 1.25 },
    contactRow: { flexDirection: 'row', gap: 12, marginTop: 1 },
    fineprint: {
      fontSize: PT.fineprint,
      color: COLOURS.ink,
      lineHeight: 1.3,
      marginTop: 4,
    },

    partnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 6,
    },
    partnerMark: { height: 22, objectFit: 'contain' },

    referenceAbove: {
      textAlign: 'right',
      fontSize: PT.title,
      fontWeight: 'bold',
      marginBottom: 2,
    },

    statutoryBand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      borderTopWidth: 0.5,
      borderBottomWidth: 0.5,
      borderColor: COLOURS.rule,
      paddingVertical: 3,
      marginTop: 8,
    },
    statutoryText: { fontSize: PT.denseLabel, fontWeight: 'bold' },

    titleBand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: 10,
      marginBottom: 6,
    },
    documentTitle: { fontSize: PT.title, fontWeight: 'bold' },
    documentReference: { fontSize: PT.title, fontWeight: 'bold' },

    partyRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    partyBlock: { borderWidth: 0.5, borderColor: COLOURS.rule },
    partyBlockLeft: { flex: 62 },
    partyBlockRight: { flex: 38 },
    partyHeaderCell: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    partyRowCell: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    partyLabel: {
      width: 74,
      padding: 3,
      fontSize: PT.body,
      borderRightWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    partyValue: { flex: 1, padding: 3, fontSize: PT.body },

    scopeLine: {
      fontSize: PT.subHeading,
      fontWeight: 'bold',
      marginTop: 4,
      marginBottom: 6,
    },

    table: { borderWidth: 0.5, borderColor: COLOURS.rule },
    tableHeaderRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    th: {
      fontSize: PT.tableHeader,
      fontWeight: 'bold',
      padding: 3,
      borderRightWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    td: {
      fontSize: PT.body,
      padding: 3,
      borderRightWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    colItem: { width: 30, textAlign: 'center' },
    colQty: { width: 38, textAlign: 'center' },
    colDescription: { flex: 1 },
    colCode: { width: 74 },
    colUnit: { width: 84, textAlign: 'right' },
    colTotal: { width: 96, textAlign: 'right', borderRightWidth: 0 },

    totalsRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    totalsLabel: {
      flex: 1,
      padding: 3,
      fontSize: PT.body,
      fontWeight: 'bold',
      textAlign: 'right',
      borderRightWidth: 0.5,
      borderColor: COLOURS.rule,
    },
    totalsValue: {
      width: 96,
      padding: 3,
      fontSize: PT.body,
      textAlign: 'right',
    },
    totalsValueBold: {
      width: 96,
      padding: 3,
      fontSize: PT.bodyAlt,
      fontWeight: 'bold',
      textAlign: 'right',
    },

    sectionHeading: {
      fontSize: PT.heading,
      fontWeight: 'bold',
      marginTop: 12,
      marginBottom: 4,
    },
    termsHeading: {
      fontSize: PT.tableHeader,
      fontWeight: 'bold',
      marginTop: 6,
    },
    termsBody: { fontSize: PT.body, marginTop: 1, lineHeight: 1.35 },

    body: { fontSize: PT.bodyAlt, lineHeight: 1.5, marginTop: 8 },

    closing: { fontSize: PT.body, marginTop: 14, lineHeight: 1.4 },

    signOffBlock: { marginTop: 8, width: 300 },
    signOffName: { fontSize: PT.body, fontWeight: 'bold' },
    signOffTitle: { fontSize: PT.body, fontWeight: 'bold' },
    signOffContacts: {
      flexDirection: 'row',
      borderWidth: 0.5,
      borderColor: COLOURS.rule,
      marginTop: 3,
    },
    signOffContactCell: {
      flex: 1,
      padding: 3,
      fontSize: PT.denseLabel,
      borderRightWidth: 0.5,
      borderColor: COLOURS.rule,
    },

    sealRow: {
      flexDirection: 'row',
      gap: 24,
      marginTop: 12,
      alignItems: 'flex-end',
    },
    sealImage: { height: 84, objectFit: 'contain' },
    sealCaption: {
      fontSize: PT.fineprint,
      color: COLOURS.secondary,
      marginTop: 2,
    },

    bankHeading: {
      fontSize: PT.subHeading,
      fontWeight: 'bold',
      marginTop: 20,
      marginBottom: 4,
    },
    bankRow: { flexDirection: 'row', marginBottom: 1 },
    bankLabel: { width: 150, fontSize: PT.bodyAlt },
    bankValue: { flex: 1, fontSize: PT.bodyAlt },

    footer: {
      position: 'absolute',
      bottom: 18,
      left: 36,
      right: 36,
      borderTopWidth: 0.5,
      borderColor: COLOURS.rule,
      paddingTop: 3,
    },
    footerTagline: {
      fontSize: PT.footer,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    footerDirectors: { fontSize: PT.footer, textAlign: 'center' },
    footerNotice: {
      fontSize: PT.fineprint,
      color: COLOURS.secondary,
      textAlign: 'center',
      marginTop: 2,
    },
    pageNumber: {
      position: 'absolute',
      bottom: 18,
      right: 36,
      fontSize: PT.footer,
    },

    watermark: {
      position: 'absolute',
      top: 320,
      left: 60,
      right: 60,
      textAlign: 'center',
      fontSize: 64,
      color: COLOURS.draft,
      opacity: 0.12,
      fontWeight: 'bold',
    },
  })
}

function LabelledRow({
  label,
  value,
  styles,
}: {
  label: string
  value: string | null | undefined
  styles: ReturnType<typeof buildStyles>
}) {
  return (
    <View style={styles.partyRowCell}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyValue}>{value ? `: ${value}` : ''}</Text>
    </View>
  )
}

export function DocumentPdf({ doc }: { doc: RenderDocument }) {
  const font = resolveFont()
  const styles = buildStyles(font.family)
  const layout = layoutFor(doc.documentType)
  const money = (v: string) => formatAmount(v)

  return (
    <Document
      title={doc.reference ?? doc.title}
      author={doc.company.entityName}
      subject={doc.typeLabel}
      creator="HA GROUP AI Operations Platform"
      producer="HA GROUP AI Operations Platform"
    >
      <Page size="A4" style={styles.page} wrap>
        {doc.watermark ? (
          <Text style={styles.watermark} fixed>
            {doc.watermark}
          </Text>
        ) : null}

        {/* Reference above the letterhead, as tax invoices print it. */}
        {layout.referencePosition === 'above_letterhead' && doc.reference ? (
          <Text style={styles.referenceAbove}>{doc.reference}</Text>
        ) : null}

        {/* ---------------- Letterhead ---------------- */}
        <View style={styles.letterhead} fixed>
          <View style={styles.logoColumn}>
            {doc.logo ? <Image style={styles.logo} src={doc.logo.source} /> : null}
            <Text style={styles.entityName}>{doc.company.entityName}</Text>
          </View>

          <View style={styles.addressColumn}>
            <Text style={styles.addressHeading}>{doc.company.country.toUpperCase()}:</Text>
            {doc.company.addressLines.map((line, i) => (
              <Text key={i} style={styles.addressLine}>
                {line}
              </Text>
            ))}
            {doc.company.city ? <Text style={styles.addressLine}>{doc.company.city}</Text> : null}

            <View style={styles.contactRow}>
              {doc.company.phone ? (
                <Text style={styles.addressLine}>T: {doc.company.phone}</Text>
              ) : null}
              {doc.company.email ? (
                <Text style={styles.addressLine}>E: {doc.company.email}</Text>
              ) : null}
            </View>
            <View style={styles.contactRow}>
              {doc.company.whatsapp ? (
                <Text style={styles.addressLine}>WB: {doc.company.whatsapp}</Text>
              ) : null}
              {doc.company.website ? (
                <Text style={styles.addressLine}>W: {doc.company.website}</Text>
              ) : null}
            </View>

            {doc.company.fineprint ? (
              <Text style={styles.fineprint}>{doc.company.fineprint}</Text>
            ) : null}
          </View>
        </View>

        {doc.partnerMarks.length > 0 ? (
          <View style={styles.partnerRow} fixed>
            {doc.partnerMarks.map((mark, i) => (
              <Image key={i} style={styles.partnerMark} src={mark.source} />
            ))}
          </View>
        ) : null}

        {/* ---------------- Statutory band (tax documents) ---------------- */}
        {layout.showStatutoryBand ? (
          <View style={styles.statutoryBand}>
            <Text style={styles.statutoryText}>
              {[
                doc.company.registrationNumber ? `RN: ${doc.company.registrationNumber}` : null,
                doc.company.tin ? `TIN: ${doc.company.tin}` : null,
                doc.company.businessLicence ? `BL: ${doc.company.businessLicence}` : null,
                doc.company.importExportLicence
                  ? `IMPORT/EXPORT: ${doc.company.importExportLicence}`
                  : null,
                doc.company.vrn ? `VRN: ${doc.company.vrn}` : null,
              ]
                .filter(Boolean)
                .join('   ')}
            </Text>
            <Text style={{ fontSize: PT.title, fontWeight: 'bold' }}>{layout.label}</Text>
          </View>
        ) : null}

        {/* ---------------- Title band ---------------- */}
        {layout.referencePosition === 'title_band' && layout.label ? (
          <View style={styles.titleBand}>
            <Text style={styles.documentTitle}>{layout.label}</Text>
            {doc.reference ? <Text style={styles.documentReference}>{doc.reference}</Text> : null}
          </View>
        ) : null}

        {/* ---------------- Customer and misc blocks ---------------- */}
        <View style={styles.partyRow}>
          <View style={[styles.partyBlock, styles.partyBlockLeft]}>
            <View style={styles.partyHeaderCell}>
              <Text style={[styles.partyLabel, { fontWeight: 'bold' }]}>Customer</Text>
              <Text style={styles.partyValue}>
                {doc.client.accountNumber ? `Account number: ${doc.client.accountNumber}` : ''}
              </Text>
            </View>
            <LabelledRow label="Contact" value={doc.client.contactPerson} styles={styles} />
            <LabelledRow label="Company" value={doc.client.name} styles={styles} />
            <LabelledRow
              label="Address"
              value={doc.client.addressLines.join(', ') || null}
              styles={styles}
            />
            <LabelledRow label="Phone" value={doc.client.phone} styles={styles} />
            {layout.showStatutoryBand ? (
              <>
                <LabelledRow label="TIN" value={doc.client.tin} styles={styles} />
                <LabelledRow label="VRN" value={doc.client.vrn} styles={styles} />
              </>
            ) : null}
          </View>

          <View style={[styles.partyBlock, styles.partyBlockRight]}>
            <View style={styles.partyHeaderCell}>
              <Text style={[styles.partyLabel, { fontWeight: 'bold' }]}>Misc.</Text>
              <Text style={styles.partyValue} />
            </View>
            <LabelledRow label="Date" value={doc.documentDate} styles={styles} />
            <LabelledRow label="Reference" value={doc.clientReference ?? 'N/A'} styles={styles} />
            {doc.client.vendorId ? (
              <LabelledRow label="Vendor ID" value={doc.client.vendorId} styles={styles} />
            ) : null}
            {doc.purchaseOrderNumber ? (
              <LabelledRow label="Order" value={doc.purchaseOrderNumber} styles={styles} />
            ) : null}
            {layout.showStatutoryBand ? (
              <>
                <LabelledRow label="TIN" value={doc.company.tin} styles={styles} />
                <LabelledRow label="VRN" value={doc.company.vrn} styles={styles} />
              </>
            ) : null}
          </View>
        </View>

        {doc.scopeLine ? <Text style={styles.scopeLine}>SCOPE: {doc.scopeLine}</Text> : null}

        {/* ---------------- Line items ---------------- */}
        {layout.showLineTable && doc.lines.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, styles.colItem]}>ITEM</Text>
              <Text style={[styles.th, styles.colQty]}>QTY</Text>
              <Text style={[styles.th, styles.colDescription]}>DESCRIPTION</Text>
              {layout.showTotals ? (
                <>
                  <Text style={[styles.th, styles.colCode]}>ITEM CODE</Text>
                  <Text style={[styles.th, styles.colUnit]}>UNIT COST</Text>
                  <Text style={[styles.th, styles.colTotal]}>
                    {doc.totals?.currency ?? ''} TOTAL
                  </Text>
                </>
              ) : (
                <Text style={[styles.th, styles.colCode, { borderRightWidth: 0 }]}>UNIT</Text>
              )}
            </View>

            {doc.lines.map((line) => (
              <View key={line.position} style={styles.tableRow} wrap={false}>
                <Text style={[styles.td, styles.colItem]}>{line.position + 1}</Text>
                <Text style={[styles.td, styles.colQty]}>{line.quantity}</Text>
                <Text style={[styles.td, styles.colDescription]}>{line.description}</Text>
                {layout.showTotals ? (
                  <>
                    <Text style={[styles.td, styles.colCode]}>{line.itemCode ?? ''}</Text>
                    <Text style={[styles.td, styles.colUnit]}>{money(line.unitPrice)}</Text>
                    <Text style={[styles.td, styles.colTotal]}>{money(line.lineTotal)}</Text>
                  </>
                ) : (
                  <Text style={[styles.td, styles.colCode, { borderRightWidth: 0 }]}>
                    {line.unit ?? ''}
                  </Text>
                )}
              </View>
            ))}

            {/* Totals ladder, in the order the finance engine computed it. */}
            {layout.showTotals && doc.totals ? (
              <>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>SUB TOTAL</Text>
                  <Text style={styles.totalsValueBold}>{money(doc.totals.subTotal)}</Text>
                </View>

                {doc.totals.charges
                  .filter((c) => c.appliesBeforeVat)
                  .map((charge, i) => (
                    <View key={i} style={styles.totalsRow}>
                      <Text style={styles.totalsLabel}>
                        {charge.label} ({charge.ratePercent}%)
                      </Text>
                      <Text style={styles.totalsValue}>{money(charge.amount)}</Text>
                    </View>
                  ))}

                {doc.totals.charges.some((c) => c.appliesBeforeVat) ? (
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>TOTAL</Text>
                    <Text style={styles.totalsValueBold}>{money(doc.totals.taxableTotal)}</Text>
                  </View>
                ) : null}

                {doc.totals.taxRatePercent ? (
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>
                      {doc.totals.taxLabel ?? 'VAT'} ({doc.totals.taxRatePercent}%)
                    </Text>
                    <Text style={styles.totalsValue}>{money(doc.totals.taxAmount)}</Text>
                  </View>
                ) : null}

                {doc.totals.charges
                  .filter((c) => !c.appliesBeforeVat)
                  .map((charge, i) => (
                    <View key={`after-${i}`} style={styles.totalsRow}>
                      <Text style={styles.totalsLabel}>
                        {charge.label} ({charge.ratePercent}%)
                      </Text>
                      <Text style={styles.totalsValue}>{money(charge.amount)}</Text>
                    </View>
                  ))}

                <View style={[styles.totalsRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.totalsLabel}>
                    {doc.documentType === 'quotation' ? 'TOTAL INCL' : 'GRAND TOTAL'}
                  </Text>
                  <Text style={styles.totalsValueBold}>{money(doc.totals.grandTotal)}</Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {/* ---------------- Prose body ---------------- */}
        {doc.bodyContent ? <Text style={styles.body}>{doc.bodyContent}</Text> : null}

        {/* ---------------- Terms ---------------- */}
        {layout.showTerms && doc.terms ? (
          <View>
            <Text style={styles.sectionHeading}>TERMS AND ENGINEERING CONDITIONS</Text>
            {doc.terms.paymentTerms ? (
              <>
                <Text style={styles.termsHeading}>PAYMENT TERMS AND CONDITIONS:</Text>
                <Text style={styles.termsBody}>{doc.terms.paymentTerms}</Text>
              </>
            ) : null}
            {doc.terms.vatStatement ? (
              <>
                <Text style={styles.termsHeading}>VALUE ADDED TAX (VAT):</Text>
                <Text style={styles.termsBody}>{doc.terms.vatStatement}</Text>
              </>
            ) : null}
            {doc.terms.deliveryTime ? (
              <>
                <Text style={styles.termsHeading}>DELIVERY TIME:</Text>
                <Text style={styles.termsBody}>{doc.terms.deliveryTime}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {/* ---------------- Sign-off ---------------- */}
        {layout.showSignOff && doc.preparedBy ? (
          <View wrap={false}>
            <Text style={styles.closing}>
              We thank you for trusting us with your business.{'\n'}Yours Sincerely
            </Text>

            {doc.seals.filter((s) => s.kind === 'signature').length > 0 ? (
              <View style={styles.sealRow}>
                {doc.seals
                  .filter((s) => s.kind === 'signature')
                  .map((seal, i) => (
                    <View key={i}>
                      <Image style={styles.sealImage} src={seal.source} />
                      <Text style={styles.sealCaption}>
                        {seal.appliedByName} · {seal.appliedAt}
                      </Text>
                    </View>
                  ))}
              </View>
            ) : null}

            <View style={styles.signOffBlock}>
              <Text style={styles.signOffName}>{doc.preparedBy.name}</Text>
              {doc.preparedBy.title ? (
                <Text style={styles.signOffTitle}>{doc.preparedBy.title}</Text>
              ) : null}
              <View style={styles.signOffContacts}>
                <Text style={styles.signOffContactCell}>Direct: {doc.preparedBy.phone ?? ''}</Text>
                <Text style={[styles.signOffContactCell, { borderRightWidth: 0 }]}>
                  Email: {doc.preparedBy.email ?? ''}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ---------------- Banking ---------------- */}
        {layout.showBankDetails && doc.bank ? (
          <View wrap={false}>
            <Text style={styles.bankHeading}>Our Banking Details are:</Text>
            {(
              [
                ['Account Name', doc.bank.accountName],
                ['Bank', doc.bank.bankName],
                [
                  'Branch',
                  doc.bank.branch ? `${doc.bank.branch} (${doc.bank.branchCode ?? ''})` : null,
                ],
                ['Account Number', `${doc.bank.accountNumber} (${doc.bank.currency})`],
                ['Swift Code', doc.bank.swiftCode],
                ['Sort Code', doc.bank.sortCode],
              ] as Array<[string, string | null | undefined]>
            )
              .filter(([, value]) => Boolean(value))
              .map(([label, value], i) => (
                <View key={i} style={styles.bankRow}>
                  <Text style={styles.bankLabel}>{label}</Text>
                  <Text style={styles.bankValue}>: {value}</Text>
                </View>
              ))}

            {doc.seals.filter((s) => s.kind === 'stamp').length > 0 ? (
              <View style={styles.sealRow}>
                {doc.seals
                  .filter((s) => s.kind === 'stamp')
                  .map((seal, i) => (
                    <View key={i}>
                      <Image style={styles.sealImage} src={seal.source} />
                      <Text style={styles.sealCaption}>
                        Applied by {seal.appliedByName} · {seal.appliedAt}
                      </Text>
                    </View>
                  ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ---------------- Footer ---------------- */}
        {doc.footer.showFooter ? (
          <View style={styles.footer} fixed>
            {doc.footer.tagline ? (
              <Text style={styles.footerTagline}>{doc.footer.tagline}</Text>
            ) : null}
            {doc.footer.directorsLine ? (
              <Text style={styles.footerDirectors}>{doc.footer.directorsLine}</Text>
            ) : null}
            {doc.fontSubstitutionNotice ? (
              <Text style={styles.footerNotice}>{doc.fontSubstitutionNotice}</Text>
            ) : null}
          </View>
        ) : null}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}

export async function renderDocumentPdf(doc: RenderDocument): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(<DocumentPdf doc={doc} />)
}
