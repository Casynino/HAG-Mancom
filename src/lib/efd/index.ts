import 'server-only'

/**
 * EFD / TRA integration adapter.
 *
 * HA GROUP does not currently have an approved TRA electronic fiscal device
 * integration configured in this platform, and the brief is explicit that the
 * system must not pretend to issue a TRA receipt without one. So this module
 * does exactly two things:
 *
 *   1. reports honestly whether an integration is configured; and
 *   2. defines the interface a real one would implement, so adding it later is
 *      a new file here rather than a change to the finance module.
 *
 * Until credentials exist, `recordEfdReceiptAction` stores the receipt a human
 * obtained from a certified device. That is a real record of a real receipt —
 * not a simulation of one.
 */

export interface EfdRequest {
  invoiceReference: string
  issuedOn: string
  currency: string
  netAmount: string
  taxAmount: string
  grossAmount: string
  customerName: string
  customerTin: string | null
  customerVrn: string | null
  lines: Array<{ description: string; quantity: string; unitPrice: string; taxCode: string }>
}

export interface EfdResult {
  receiptNumber: string
  issuedOn: string
  verificationCode: string | null
  providerReference: string
  /** The receipt document, when the provider returns one. */
  receiptPdf?: Buffer
}

export interface EfdProvider {
  readonly name: string
  isConfigured(): boolean
  issue(request: EfdRequest): Promise<EfdResult>
}

/**
 * The only provider that exists today. It refuses to issue rather than
 * fabricating a receipt number.
 */
class ManualEfdProvider implements EfdProvider {
  readonly name = 'manual'

  isConfigured(): boolean {
    return false
  }

  async issue(): Promise<EfdResult> {
    throw new Error(
      'No TRA EFD integration is configured. An EFD receipt must be obtained from a certified ' +
        'fiscal device and recorded in the platform. The platform does not issue TRA receipts.',
    )
  }
}

let provider: EfdProvider = new ManualEfdProvider()

/**
 * Registers a real provider. Called from a future integration module once HA
 * GROUP has TRA credentials and approval; nothing else in the codebase needs to
 * change.
 */
export function registerEfdProvider(next: EfdProvider): void {
  provider = next
}

export function getEfdProvider(): EfdProvider {
  return provider
}

export function isEfdIntegrationConfigured(): boolean {
  return provider.isConfigured()
}

/** What an Administrator needs to supply before automatic issuing is possible. */
export const EFD_REQUIREMENTS = [
  'TRA approval for electronic fiscal receipting through a software integration.',
  'A registered Virtual Fiscal Device (VFD) or certified EFD with API access.',
  'The VFD certificate, serial number and TIN registered with TRA.',
  'API credentials, stored as environment variables and never in the database.',
] as const
