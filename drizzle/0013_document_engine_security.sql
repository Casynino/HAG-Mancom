-- ===========================================================================
-- Document Engine — grants, policies and the guarantees that make an approved
-- document trustworthy.
--
-- The claims this file has to make good on:
--   * an approved document is immutable;
--   * a correction produces a new version, never an edit;
--   * a Technical Officer can never apply a Director's signature or the stamp;
--   * a tax invoice cannot reach approval without a client PO and signed
--     delivery or completion evidence;
--   * a document number, once issued, is never reused or rewritten.
--
-- All of it is enforced by triggers and policies, so it holds regardless of
-- what the application layer does.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update on
  public.documents,
  public.deliveries,
  public.completion_records,
  public.efd_receipts,
  public.compliance_types,
  public.compliance_records,
  public.email_messages,
  public.brand_training_assets
to hagroup_app;

-- Child rows are replaced wholesale while a document is editable, so these
-- need DELETE. The editability trigger below is what keeps that safe.
grant select, insert, update, delete on
  public.document_lines,
  public.document_charges,
  public.delivery_items
to hagroup_app;

-- Append-only.
grant select, insert on
  public.document_versions,
  public.document_seals,
  public.document_events,
  public.delivery_photos,
  public.email_attachments,
  public.compliance_alerts,
  public.ai_interactions
to hagroup_app;

do $do$
declare t text;
begin
  foreach t in array array[
    'documents','document_lines','document_charges','document_versions','document_seals',
    'document_events','deliveries','delivery_items','delivery_photos','completion_records',
    'efd_receipts','compliance_types','compliance_records','compliance_alerts',
    'email_messages','email_attachments','brand_training_assets','ai_interactions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array[
    'documents','deliveries','completion_records','efd_receipts',
    'compliance_types','compliance_records','brand_training_assets'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;

  foreach t in array array[
    'document_versions','document_seals','document_events','delivery_photos',
    'email_attachments','compliance_alerts','ai_interactions'
  ] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function app.deny_mutation()',
      t || '_append_only', t
    );
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- Visibility predicates
-- ---------------------------------------------------------------------------
create or replace function app.can_view_document(p_document_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and (app.is_staff() or app.is_project_member(d.project_id))
  )
$fn$;

-- A document is editable only while it is a draft or has been sent back.
create or replace function app.document_is_editable(p_document_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and d.status in ('draft', 'changes_requested')
      and (app.is_technical_officer() or app.is_admin())
  )
$fn$;

/**
 * Does signed evidence exist that the work was delivered or completed?
 *
 * A confirmed delivery means both sides signed. A verified completion record
 * means a Technical Officer checked the client's acceptance document. Either
 * satisfies the gate; neither can be waived from the application layer.
 */
create or replace function app.invoice_evidence_exists(p_project_id uuid, p_po_id uuid)
returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select
    exists (
      select 1 from public.deliveries dl
      where dl.project_id = p_project_id
        and dl.status = 'confirmed'
        and (p_po_id is null or dl.client_purchase_order_id is null
             or dl.client_purchase_order_id = p_po_id)
    )
    or exists (
      select 1 from public.completion_records cr
      where cr.project_id = p_project_id
        and cr.verified_at is not null
        and (p_po_id is null or cr.client_purchase_order_id is null
             or cr.client_purchase_order_id = p_po_id)
    )
$fn$;

-- ---------------------------------------------------------------------------
-- Document workflow: transitions, immutability, and the invoice gate
-- ---------------------------------------------------------------------------
create or replace function app.enforce_document_workflow() returns trigger
language plpgsql as $fn$
declare
  allowed boolean := false;
begin
  -- The internal reference is issued once and never rewritten. Reusing or
  -- editing one would break the guarantee the numbering system exists for.
  if old.reference is not null and new.reference is distinct from old.reference then
    raise exception 'A document reference cannot be changed once issued'
      using errcode = 'restrict_violation';
  end if;

  if new.status is distinct from old.status then
    allowed := case old.status
      when 'draft' then
        new.status in ('pending_review', 'pending_approval', 'cancelled')
      when 'pending_review' then
        new.status in ('draft', 'pending_approval', 'changes_requested', 'cancelled')
      when 'pending_approval' then
        new.status in ('approved', 'rejected', 'changes_requested', 'cancelled')
      when 'changes_requested' then
        new.status in ('draft', 'pending_review', 'pending_approval', 'cancelled')
      when 'rejected' then
        new.status in ('draft', 'cancelled')
      -- An approved document goes forward only. It never returns to an
      -- editable state; a correction is a new document version.
      when 'approved' then
        new.status in ('issued', 'archived', 'cancelled')
      when 'issued' then
        new.status in ('archived', 'cancelled')
      when 'archived' then false
      when 'cancelled' then false
      else false
    end;

    if not allowed then
      raise exception 'Invalid document status transition: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;

    -- A tax invoice may not be put forward for approval without a client
    -- Purchase Order and signed evidence that the work was done.
    if new.status = 'pending_approval' and new.document_type = 'tax_invoice' then
      if new.client_purchase_order_id is null then
        raise exception 'A tax invoice needs the client Purchase Order recorded before it can be approved'
          using errcode = 'check_violation';
      end if;

      if not app.invoice_evidence_exists(new.project_id, new.client_purchase_order_id) then
        raise exception 'A tax invoice needs a confirmed Delivery Note or verified completion evidence before it can be approved'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- Content is frozen unless the document is back in the Technical Office's
  -- hands. This is the immutability guarantee, and it applies to every role.
  if old.status not in ('draft', 'changes_requested') then
    if new.document_type is distinct from old.document_type
       or new.client_id is distinct from old.client_id
       or new.project_id is distinct from old.project_id
       or new.client_purchase_order_id is distinct from old.client_purchase_order_id
       or new.title is distinct from old.title
       or new.scope_description is distinct from old.scope_description
       or new.service_period_label is distinct from old.service_period_label
       or new.body_content is distinct from old.body_content
       or new.terms is distinct from old.terms
       or new.currency is distinct from old.currency
       or new.tax_code is distinct from old.tax_code
       or new.tax_rate_percent is distinct from old.tax_rate_percent
       or new.rounding_policy is distinct from old.rounding_policy
       or new.sub_total is distinct from old.sub_total
       or new.charges_before_vat is distinct from old.charges_before_vat
       or new.charges_after_vat is distinct from old.charges_after_vat
       or new.taxable_total is distinct from old.taxable_total
       or new.tax_amount is distinct from old.tax_amount
       or new.grand_total is distinct from old.grand_total
       or new.legal_entity_id is distinct from old.legal_entity_id
       or new.entity_address_id is distinct from old.entity_address_id
       or new.bank_account_id is distinct from old.bank_account_id
       or new.document_date is distinct from old.document_date then
      raise exception 'This document is % and its content can no longer be changed. Create a new revision instead.', old.status
        using errcode = 'restrict_violation';
    end if;
  end if;

  -- The filename stays editable right up to approval, then fixes.
  if old.status in ('approved', 'issued', 'archived')
     and new.filename is distinct from old.filename then
    raise exception 'The filename of an approved document cannot be changed'
      using errcode = 'restrict_violation';
  end if;

  return new;
end
$fn$;

create trigger documents_workflow_guard
  before update on public.documents
  for each row execute function app.enforce_document_workflow();

-- Lines and charges follow the parent's editability, for every role.
create or replace function app.enforce_document_child_editable() returns trigger
language plpgsql as $fn$
declare
  parent_status public.document_status;
begin
  select status into parent_status
  from public.documents
  where id = coalesce(new.document_id, old.document_id);

  if parent_status is null then
    return coalesce(new, old);
  end if;

  if parent_status not in ('draft', 'changes_requested') then
    raise exception 'Cannot modify % while the document is %', tg_table_name, parent_status
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end
$fn$;

create trigger document_lines_editable
  before insert or update or delete on public.document_lines
  for each row execute function app.enforce_document_child_editable();

create trigger document_charges_editable
  before insert or update or delete on public.document_charges
  for each row execute function app.enforce_document_child_editable();

-- ---------------------------------------------------------------------------
-- Signatures and stamps
--
-- Section F of the brief states as an absolute that a Technical Officer must
-- never apply a Director signature or the company stamp. This trigger is that
-- rule. It reads the acting user's live roles, so no approval policy, no
-- delegation setting and no application bug can route around it.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_seal_authority() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
declare
  v_owner uuid;
  v_kind public.asset_kind;
  v_state public.config_state;
begin
  if app.current_user_id() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if new.seal_kind not in ('signature', 'stamp') then
    raise exception 'Unknown seal kind: %', new.seal_kind using errcode = 'check_violation';
  end if;

  if new.applied_by <> app.current_user_id() then
    raise exception 'A seal must be recorded against the person applying it'
      using errcode = 'insufficient_privilege';
  end if;

  select owner_user_id, kind, state into v_owner, v_kind, v_state
  from public.company_assets where id = new.company_asset_id;

  if v_kind is null then
    raise exception 'That signature or stamp asset does not exist' using errcode = 'no_data_found';
  end if;

  if v_state <> 'approved' then
    raise exception 'That asset has not been approved for use' using errcode = 'check_violation';
  end if;

  if new.seal_kind = 'signature' then
    if not app.has_role('director') then
      raise exception 'Only a Director may apply a signature'
        using errcode = 'insufficient_privilege';
    end if;
    -- And only their own. A Director cannot sign as another Director.
    if v_owner is distinct from app.current_user_id() then
      raise exception 'A signature may only be applied by the person it belongs to'
        using errcode = 'insufficient_privilege';
    end if;
    if v_kind <> 'signature' then
      raise exception 'That asset is not a signature' using errcode = 'check_violation';
    end if;
  else
    if not (app.has_role('director') or app.has_role('administrator')) then
      raise exception 'Only a Director or Administrator may apply the company stamp'
        using errcode = 'insufficient_privilege';
    end if;
    if v_kind <> 'stamp' then
      raise exception 'That asset is not the company stamp' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$fn$;

create trigger document_seals_authority
  before insert on public.document_seals
  for each row execute function app.enforce_seal_authority();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy documents_select on public.documents for select
  using (app.is_staff() or app.is_project_member(project_id));

create policy documents_insert on public.documents for insert
  with check (app.is_technical_officer() or app.is_admin());

-- Two update policies: the Technical Office edits and submits; Directors and
-- Administrators act on documents that have reached them.
create policy documents_update_office on public.documents for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

create policy documents_update_director on public.documents for update
  using (app.is_director()) with check (app.is_director());

do $do$
declare t text;
begin
  foreach t in array array['document_lines', 'document_charges'] loop
    execute format($p$
      create policy %I on public.%I for select using (app.can_view_document(document_id))
    $p$, t || '_select', t);
    execute format($p$
      create policy %I on public.%I for insert with check (app.document_is_editable(document_id))
    $p$, t || '_insert', t);
    execute format($p$
      create policy %I on public.%I for update
        using (app.document_is_editable(document_id))
        with check (app.document_is_editable(document_id))
    $p$, t || '_update', t);
    execute format($p$
      create policy %I on public.%I for delete using (app.document_is_editable(document_id))
    $p$, t || '_delete', t);
  end loop;

  foreach t in array array['document_versions', 'document_events'] loop
    execute format($p$
      create policy %I on public.%I for select using (app.can_view_document(document_id))
    $p$, t || '_select', t);
    execute format($p$
      create policy %I on public.%I for insert with check (app.is_staff())
    $p$, t || '_insert', t);
  end loop;
end
$do$;

create policy document_seals_select on public.document_seals for select
  using (app.is_staff());

create policy document_seals_insert on public.document_seals for insert
  with check (app.is_director() or app.is_admin());

-- Deliveries and completion evidence
create policy deliveries_select on public.deliveries for select
  using (app.is_staff() or app.is_project_member(project_id));
create policy deliveries_insert on public.deliveries for insert
  with check (app.is_technical_officer() or app.is_admin());
create policy deliveries_update on public.deliveries for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

create policy delivery_items_select on public.delivery_items for select
  using (exists (select 1 from public.deliveries d where d.id = delivery_id
                 and (app.is_staff() or app.is_project_member(d.project_id))));
create policy delivery_items_write on public.delivery_items for all
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

create policy delivery_photos_select on public.delivery_photos for select
  using (exists (select 1 from public.deliveries d where d.id = delivery_id
                 and (app.is_staff() or app.is_project_member(d.project_id))));
create policy delivery_photos_insert on public.delivery_photos for insert
  with check (app.is_staff());

create policy completion_records_select on public.completion_records for select
  using (app.is_staff() or app.is_project_member(project_id));
create policy completion_records_insert on public.completion_records for insert
  with check (app.is_staff());
create policy completion_records_update on public.completion_records for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

-- EFD receipts
create policy efd_receipts_select on public.efd_receipts for select
  using (app.is_staff());
create policy efd_receipts_insert on public.efd_receipts for insert
  with check (app.is_technical_officer() or app.is_admin());
create policy efd_receipts_update on public.efd_receipts for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

-- Compliance: visible to every member of staff, maintained by the Technical
-- Office, with the certificate types themselves under Administrator control.
create policy compliance_types_select on public.compliance_types for select
  using (app.is_active_user());
create policy compliance_types_insert on public.compliance_types for insert
  with check (app.is_admin());
create policy compliance_types_update on public.compliance_types for update
  using (app.is_admin()) with check (app.is_admin());

create policy compliance_records_select on public.compliance_records for select
  using (app.is_staff());
create policy compliance_records_insert on public.compliance_records for insert
  with check (app.is_technical_officer() or app.is_admin());
create policy compliance_records_update on public.compliance_records for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

create policy compliance_alerts_select on public.compliance_alerts for select
  using (app.is_staff());
create policy compliance_alerts_insert on public.compliance_alerts for insert
  with check (app.is_active_user());

-- Email: the log is operational history, so staff may read it.
create policy email_messages_select on public.email_messages for select
  using (app.is_staff());
create policy email_messages_insert on public.email_messages for insert
  with check (app.is_staff());
create policy email_messages_update on public.email_messages for update
  using (app.is_staff()) with check (app.is_staff());

create policy email_attachments_select on public.email_attachments for select
  using (app.is_staff());
create policy email_attachments_insert on public.email_attachments for insert
  with check (app.is_staff());

-- Brand training assets are Administrator territory.
create policy brand_training_assets_select on public.brand_training_assets for select
  using (app.is_admin());
create policy brand_training_assets_insert on public.brand_training_assets for insert
  with check (app.is_admin());
create policy brand_training_assets_update on public.brand_training_assets for update
  using (app.is_admin()) with check (app.is_admin());

create policy ai_interactions_select on public.ai_interactions for select
  using (app.is_admin() or app.is_director() or requested_by = app.current_user_id());
create policy ai_interactions_insert on public.ai_interactions for insert
  with check (app.is_active_user());

grant execute on all functions in schema app to hagroup_app;
