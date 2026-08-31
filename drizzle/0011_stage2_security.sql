-- ===========================================================================
-- Stage 2 — grants, policies and guarantees for the commercial records
-- ===========================================================================

grant select, insert, update on
  public.client_contacts,
  public.client_purchase_orders
to hagroup_app;

alter table public.client_contacts enable row level security;
alter table public.client_purchase_orders enable row level security;

create trigger client_contacts_touch_updated_at
  before update on public.client_contacts
  for each row execute function app.touch_updated_at();

create trigger client_purchase_orders_touch_updated_at
  before update on public.client_purchase_orders
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts follow the visibility of the client they belong to, so an Engineer
-- assigned to a project can call the site contact without seeing every client.
-- ---------------------------------------------------------------------------
create policy client_contacts_select on public.client_contacts for select
  using (app.can_see_client(client_id));

create policy client_contacts_insert on public.client_contacts for insert
  with check (app.is_technical_officer() or app.is_admin());

create policy client_contacts_update on public.client_contacts for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

-- ---------------------------------------------------------------------------
-- Purchase Orders. Readable by anyone who can see the project; writable by the
-- Technical Office only.
-- ---------------------------------------------------------------------------
create policy client_purchase_orders_select on public.client_purchase_orders for select
  using (app.is_staff() or app.is_project_member(project_id));

create policy client_purchase_orders_insert on public.client_purchase_orders for insert
  with check (app.is_technical_officer() or app.is_admin());

create policy client_purchase_orders_update on public.client_purchase_orders for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

-- ---------------------------------------------------------------------------
-- The central rule of this module, enforced rather than documented.
--
-- A client PO number is created by the client. This trigger guarantees the
-- platform never invents one and never silently rewrites one:
--
--   * a blank or whitespace-only number is rejected outright;
--   * once recorded, the number is immutable — correcting a mis-keyed PO means
--     cancelling the record and entering the real one, which leaves both in the
--     audit trail rather than overwriting history;
--   * the client and project it belongs to are likewise fixed.
--
-- There is no sequence, default or generator attached to this column anywhere
-- in the schema, and no function in the `app` schema returns one.
-- ---------------------------------------------------------------------------
create or replace function app.protect_client_po() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'INSERT' then
    if new.po_number is null or btrim(new.po_number) = '' then
      raise exception 'A client Purchase Order number must be supplied. The platform never generates one.'
        using errcode = 'check_violation';
    end if;
    new.po_number := btrim(new.po_number);
    return new;
  end if;

  if new.po_number is distinct from old.po_number then
    raise exception 'A Purchase Order number cannot be changed once recorded. Cancel this record and enter the correct order instead.'
      using errcode = 'restrict_violation';
  end if;

  if new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id then
    raise exception 'A Purchase Order cannot be moved to a different client or project.'
      using errcode = 'restrict_violation';
  end if;

  -- The client's original document is evidence. It may be attached once and
  -- never swapped for a different file.
  if old.document_storage_key is not null
     and new.document_storage_key is distinct from old.document_storage_key then
    raise exception 'The original Purchase Order document cannot be replaced.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end
$fn$;

create trigger client_purchase_orders_protect
  before insert or update on public.client_purchase_orders
  for each row execute function app.protect_client_po();

-- ---------------------------------------------------------------------------
-- Provenance correction on the seeded address drafts.
--
-- HA GROUP's public website gives its head office as
-- "54 Andries St, Wynberg, Sandton, South Africa". That is the same street
-- address printed under the TANZANIA heading on tax invoices HI_2670050 to
-- HI_2670053, and those invoices also carry the entity name "HA GROUP PTY LTD"
-- — a South African company form.
--
-- The most likely reading is that the tax invoice letterhead was adapted from
-- the South African entity's template and the address and entity name were not
-- changed, while Tanzanian TIN and VRN were. That is a question for HA GROUP's
-- lawyers and accountants, not for this platform to decide, so the note is
-- attached to the draft and the draft stays inactive.
--
-- Only draft rows are touched. An approved value is never rewritten.
-- ---------------------------------------------------------------------------
update public.entity_addresses
   set notes = 'Printed under the TANZANIA heading on tax invoices HI_2670050 to HI_2670053. '
             || 'HA GROUP''s public website (hpcagroup.africa) gives 54 Andries St, Wynberg, Sandton '
             || 'as the SOUTH AFRICAN head office. The same street address appearing on a Tanzanian '
             || 'tax invoice, alongside the entity name "HA GROUP PTY LTD", suggests the invoice '
             || 'letterhead was adapted from the South African template without changing the address '
             || 'or entity. Requires confirmation before any tax document is issued.'
 where label = 'Dar es Salaam — as printed on tax invoices'
   and state = 'draft';

update public.legal_entities
   set notes = notes || ' HA GROUP''s public website lists a South African head office at '
             || '54 Andries St, Wynberg, Sandton — the same address printed on these invoices. '
             || 'This strengthens the likelihood that the tax invoice letterhead belongs to the '
             || 'South African entity rather than the Tanzanian one.'
 where name = 'HA GROUP PTY LTD'
   and state = 'draft';
