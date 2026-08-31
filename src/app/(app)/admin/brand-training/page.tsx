import type { Metadata } from 'next'
import { BrandTraining } from '@/components/brand-training'
import { PageHeader, SectionBar } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { isAiConfigured } from '@/lib/ai/provider'
import { loadTrainingAssets } from '@/server/brand-training-actions'

export const metadata: Metadata = { title: 'Brand training' }

/**
 * Section 37 — teaching the assistant how HA GROUP writes.
 *
 * Historical documents are uploaded here and read for the patterns they carry:
 * the headings, the standard clauses, the reference format. What comes back is
 * a proposal. Nothing on this screen writes to company configuration, because
 * the brief is explicit that the AI must not change the company's knowledge base
 * without a controlled approval — that decision belongs to an Administrator in
 * Company settings.
 */
export default async function BrandTrainingPage() {
  const assets = await pageContext(async (_db, actor) => {
    if (!hasPermission(actor.roles, 'config.manage')) {
      throw new AuthorizationError('Brand training is managed by Administrators.')
    }
    return loadTrainingAssets()
  })

  return (
    <>
      <PageHeader
        eyebrow="Brand training"
        title="Teach the assistant how HA GROUP writes"
        description="Upload documents the company has already issued. The assistant reports the patterns it can see; you decide what becomes a standard."
        stats={[
          { label: 'uploaded', value: assets.length },
          {
            label: 'analysed',
            value: assets.filter((a) => a.analysisStatus === 'completed').length,
          },
        ]}
      />

      <SectionBar
        label="What it has been given"
        scope="It reports what it observes · nothing here changes a company setting on its own"
        tone="brand"
      />

      <BrandTraining
        assets={assets.map((a) => ({
          ...a,
          analysedAt: a.analysedAt?.toISOString() ?? null,
          uploadedAt: a.uploadedAt.toISOString(),
        }))}
        aiAvailable={isAiConfigured()}
      />
    </>
  )
}
