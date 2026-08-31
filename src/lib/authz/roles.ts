/**
 * Roles and the permission matrix.
 *
 * This module is the readable statement of who may do what. It is NOT the
 * enforcement boundary — Row Level Security in the database is. Both exist
 * deliberately: the matrix gives fast, precise errors and drives what the UI
 * offers; the database guarantees the answer even if the matrix is wrong or
 * bypassed.
 *
 * Pure functions only, no imports from the server runtime, so this file is
 * directly unit-testable.
 */

export const APP_ROLES = ['engineer', 'technical_officer', 'director', 'administrator'] as const

export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_LABELS: Record<AppRole, string> = {
  engineer: 'Engineer',
  technical_officer: 'Technical Officer',
  director: 'Director',
  administrator: 'Administrator',
}

/**
 * Capabilities. Named for the action a person takes, not the table it touches,
 * so the matrix stays readable as the schema grows.
 */
export const PERMISSIONS = [
  // Engineer workflow
  'submission.create',
  'submission.edit_own_draft',
  'submission.submit',
  'submission.view_own',
  'submission.view_all',
  'submission.review',
  'submission.request_changes',
  'submission.accept',
  'submission.mark_ready',
  'submission.cancel',

  // Business records
  'client.view',
  'client.manage',
  'project.view_assigned',
  'project.view_all',
  'project.manage',
  'project.assign_members',

  // Configuration
  'config.view',
  'config.manage',
  'config.approve',

  // Documents
  'document.view',
  'document.create',
  'document.edit',
  'document.submit',
  'document.approve',
  'document.issue',
  'document.send',

  // Operations
  'po.manage',
  'delivery.manage',
  'delivery.sign',
  'completion.manage',
  'efd.manage',
  'compliance.view',
  'compliance.manage',

  // Oversight
  'audit.view',
  'user.manage',
  'approval.decide',

  // Assets. Applying a signature or the company stamp is intentionally NOT a
  // permission a Technical Officer can ever hold, whatever the approval policy
  // says — see canApplySignature below.
  'asset.manage',
  'asset.upload_own_signature',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ENGINEER: Permission[] = [
  'submission.create',
  'submission.edit_own_draft',
  'submission.submit',
  'submission.view_own',
  'project.view_assigned',
  'client.view',
  // Engineers see documents on their own projects, and sign for handover on
  // site, but never price, submit or approve anything.
  'document.view',
  'delivery.sign',
]

const TECHNICAL_OFFICER: Permission[] = [
  'submission.view_all',
  'submission.review',
  'submission.request_changes',
  'submission.accept',
  'submission.mark_ready',
  'submission.cancel',
  'client.view',
  'client.manage',
  'project.view_all',
  'project.manage',
  'project.assign_members',
  'config.view',
  'approval.decide',
  'document.view',
  'document.create',
  'document.edit',
  'document.submit',
  'document.send',
  'po.manage',
  'delivery.manage',
  'delivery.sign',
  'completion.manage',
  'efd.manage',
  'compliance.view',
  'compliance.manage',
]

const DIRECTOR: Permission[] = [
  'submission.view_all',
  'client.view',
  'project.view_all',
  'config.view',
  'audit.view',
  'approval.decide',
  'asset.upload_own_signature',
  'document.view',
  // The Director's authority over documents: approve and issue. Not edit —
  // an approver who can rewrite what they approve is not an approver.
  'document.approve',
  'document.issue',
  'compliance.view',
]

const ADMINISTRATOR: Permission[] = [
  'submission.view_all',
  'submission.cancel',
  'client.view',
  'client.manage',
  'project.view_all',
  'project.manage',
  'project.assign_members',
  'config.view',
  'config.manage',
  'config.approve',
  'audit.view',
  'user.manage',
  'asset.manage',
  'asset.upload_own_signature',
  'document.view',
  'document.issue',
  'po.manage',
  'compliance.view',
  'compliance.manage',
  'efd.manage',
]

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  engineer: ENGINEER,
  technical_officer: TECHNICAL_OFFICER,
  director: DIRECTOR,
  administrator: ADMINISTRATOR,
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value)
}

/** A user holds the union of the permissions of every role granted to them. */
export function permissionsFor(roles: readonly AppRole[]): Set<Permission> {
  const set = new Set<Permission>()
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) set.add(permission)
  }
  return set
}

export function hasPermission(roles: readonly AppRole[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}

export function hasAnyRole(roles: readonly AppRole[], ...wanted: AppRole[]): boolean {
  return roles.some((role) => wanted.includes(role))
}

export function isStaff(roles: readonly AppRole[]): boolean {
  return hasAnyRole(roles, 'technical_officer', 'director', 'administrator')
}

/**
 * Who may apply a Director's signature or the company stamp.
 *
 * Section F of the brief: "A Technical Officer must never apply a Director
 * signature or company stamp." That is an absolute, so it is expressed as a
 * dedicated function rather than a permission in the matrix — there is no
 * approval policy, delegation or role combination that can grant it. A
 * Technical Officer who also holds the Director role passes, because they are
 * then acting as a Director.
 */
export function canApplySignature(roles: readonly AppRole[]): boolean {
  return hasAnyRole(roles, 'director')
}

export function canApplyStamp(roles: readonly AppRole[]): boolean {
  return hasAnyRole(roles, 'director', 'administrator')
}

/**
 * Landing route per role. A user with several roles gets the most operational
 * of them, since that is where their work queue lives.
 */
export function defaultRouteFor(roles: readonly AppRole[]): string {
  /*
   * Anybody who can see the command centre lands there.
   *
   * An earlier version sent each role straight to its own queue, on the
   * reasoning that a Director's work is the approval inbox rather than a
   * dashboard. HA GROUP disagreed, and they are right: the queue tells you
   * what is on your desk, and Home tells you whether the business is all
   * right — which is the question a Director and an Administrator open the
   * platform to answer. Their queue is one click away and carries its count in
   * the navigation.
   *
   * An Engineer still lands on their own portal, because they cannot see the
   * command centre at all: it reports on everybody's work, and
   * `submission.view_all` is the permission an Engineer must not hold.
   */
  if (hasPermission(roles, 'submission.view_all')) return '/dashboard'
  if (roles.includes('engineer')) return '/engineer'
  return '/dashboard'
}
