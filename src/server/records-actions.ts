'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { clients, projectMembers, projects } from '@/db/schema'
import { notify, recordAudit } from '@/lib/audit'
import { asActorWith } from '@/lib/authz/guard'
import {
  actionError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import {
  clientSchema,
  fieldErrorsFrom,
  projectMemberSchema,
  projectSchema,
} from '@/lib/validation/schemas'

/** Clients, projects and project membership. */

export async function createClientAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = clientSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const id = await asActorWith('client.manage', async (db, actor) => {
      const [created] = await db
        .insert(clients)
        .values({
          legalName: v.legalName,
          tradingName: v.tradingName ?? null,
          tin: v.tin ?? null,
          vrn: v.vrn ?? null,
          registrationNumber: v.registrationNumber ?? null,
          addressLine1: v.addressLine1 ?? null,
          addressLine2: v.addressLine2 ?? null,
          city: v.city ?? null,
          region: v.region ?? null,
          postalAddress: v.postalAddress ?? null,
          country: v.country,
          contactPerson: v.contactPerson ?? null,
          contactPhone: v.contactPhone ?? null,
          contactEmail: v.contactEmail ?? null,
          notes: v.notes ?? null,
          createdBy: actor.id,
        })
        .returning({ id: clients.id })

      await recordAudit(db, actor, {
        action: 'client.created',
        entityType: 'clients',
        entityId: created!.id,
        metadata: { legalName: v.legalName },
      })

      return created!.id
    })

    revalidatePath('/technical/clients')
    return { ok: true, data: { id }, message: `${v.legalName} added.` }
  } catch (err) {
    // A duplicate company name surfaces as a unique-violation; give it a
    // message that names the actual problem.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return {
        ok: false,
        error: 'A client with that company name already exists.',
        code: 'duplicate',
        fieldErrors: { legalName: ['That company is already on file.'] },
      }
    }
    return actionError(err)
  }
}

export async function updateClientAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const clientId = String(formData.get('clientId') ?? '')
    const parsed = clientSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    await asActorWith('client.manage', async (db, actor) => {
      const updated = await db
        .update(clients)
        .set({
          legalName: v.legalName,
          tradingName: v.tradingName ?? null,
          tin: v.tin ?? null,
          vrn: v.vrn ?? null,
          registrationNumber: v.registrationNumber ?? null,
          addressLine1: v.addressLine1 ?? null,
          addressLine2: v.addressLine2 ?? null,
          city: v.city ?? null,
          region: v.region ?? null,
          postalAddress: v.postalAddress ?? null,
          country: v.country,
          contactPerson: v.contactPerson ?? null,
          contactPhone: v.contactPhone ?? null,
          contactEmail: v.contactEmail ?? null,
          notes: v.notes ?? null,
        })
        .where(eq(clients.id, clientId))
        .returning({ id: clients.id })

      if (updated.length === 0) throw new NotFoundError('That client no longer exists.')

      await recordAudit(db, actor, {
        action: 'client.updated',
        entityType: 'clients',
        entityId: clientId,
      })
    })

    revalidatePath('/technical/clients')
    return { ok: true, data: null, message: 'Client updated.' }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Archives rather than deletes. A client with historical documents must stay
 * resolvable, so there is no delete path at all — the app role holds no DELETE
 * privilege on this table.
 */
export async function archiveClientAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const clientId = String(formData.get('clientId') ?? '')

    await asActorWith('client.manage', async (db, actor) => {
      const updated = await db
        .update(clients)
        .set({ status: 'archived', archivedAt: new Date() })
        .where(eq(clients.id, clientId))
        .returning({ id: clients.id, legalName: clients.legalName })

      if (updated.length === 0) throw new NotFoundError('That client no longer exists.')

      await recordAudit(db, actor, {
        action: 'client.archived',
        entityType: 'clients',
        entityId: clientId,
        metadata: { legalName: updated[0]!.legalName },
      })
    })

    revalidatePath('/technical/clients')
    return { ok: true, data: null, message: 'Client archived. Their history is preserved.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function createProjectAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = projectSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const id = await asActorWith('project.manage', async (db, actor) => {
      const [created] = await db
        .insert(projects)
        .values({
          clientId: v.clientId,
          name: v.name,
          reference: v.reference,
          description: v.description ?? null,
          location: v.location ?? null,
          startDate: v.startDate || null,
          expectedCompletionDate: v.expectedCompletionDate || null,
          createdBy: actor.id,
        })
        .returning({ id: projects.id })

      await recordAudit(db, actor, {
        action: 'project.created',
        entityType: 'projects',
        entityId: created!.id,
        metadata: { reference: v.reference, clientId: v.clientId },
      })

      return created!.id
    })

    revalidatePath('/technical/projects')
    return { ok: true, data: { id }, message: `${v.name} created.` }
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return {
        ok: false,
        error: 'That project reference is already in use.',
        code: 'duplicate',
        fieldErrors: { reference: ['Choose a reference that is not already used.'] },
      }
    }
    return actionError(err)
  }
}

/**
 * Assigns someone to a project.
 *
 * For an Engineer this is what grants access: the RLS policies read
 * project_members directly, so this row is the authorisation, not a label.
 */
export async function addProjectMemberAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = projectMemberSchema.safeParse({
      projectId: formData.get('projectId'),
      userId: formData.get('userId'),
      roleOnProject: formData.get('roleOnProject') ?? undefined,
      isLead: formData.get('isLead') === 'on',
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    await asActorWith('project.assign_members', async (db, actor) => {
      const [project] = await db
        .select({ id: projects.id, name: projects.name, reference: projects.reference })
        .from(projects)
        .where(eq(projects.id, v.projectId))
        .limit(1)

      if (!project) throw new NotFoundError('That project no longer exists.')

      const existing = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, v.projectId),
            eq(projectMembers.userId, v.userId),
            isNull(projectMembers.removedAt),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        throw new ConflictError('That person is already assigned to this project.')
      }

      await db.insert(projectMembers).values({
        projectId: v.projectId,
        userId: v.userId,
        roleOnProject: v.roleOnProject ?? null,
        isLead: v.isLead,
        assignedBy: actor.id,
      })

      await notify(db, actor.id, {
        userId: v.userId,
        kind: 'project_assignment',
        title: `You have been assigned to ${project.name}`,
        body: `Project ${project.reference}. You can now file site submissions against it.`,
        entityType: 'projects',
        entityId: project.id,
        href: `/engineer`,
      })

      await recordAudit(db, actor, {
        action: 'project.member_added',
        entityType: 'projects',
        entityId: v.projectId,
        metadata: { userId: v.userId, isLead: v.isLead },
      })
    })

    revalidatePath(`/technical/projects/${parsed.data.projectId}`)
    return { ok: true, data: null, message: 'Assigned.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function removeProjectMemberAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const memberId = String(formData.get('memberId') ?? '')
    const projectId = String(formData.get('projectId') ?? '')

    await asActorWith('project.assign_members', async (db, actor) => {
      const removed = await db
        .update(projectMembers)
        .set({ removedAt: new Date(), removedBy: actor.id })
        .where(and(eq(projectMembers.id, memberId), isNull(projectMembers.removedAt)))
        .returning({ userId: projectMembers.userId })

      if (removed.length === 0) throw new NotFoundError('That person is no longer assigned.')

      await recordAudit(db, actor, {
        action: 'project.member_removed',
        entityType: 'projects',
        entityId: projectId,
        metadata: { userId: removed[0]!.userId },
      })
    })

    revalidatePath(`/technical/projects/${projectId}`)
    return { ok: true, data: null, message: 'Removed from the project.' }
  } catch (err) {
    return actionError(err)
  }
}
