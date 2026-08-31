-- ===========================================================================
-- Compliance status and the standard Tanzanian certificate types.
--
-- Status is computed, never stored. "Expiring soon" depends on today, so a
-- stored value is wrong the day after it is written. Every screen and every
-- reminder sweep calls the same function, so they can never disagree.
-- ===========================================================================

create or replace function app.compliance_status(
  p_expires_on date,
  p_renewal_started_on date default null
) returns text
language sql immutable
as $fn$
  select case
    when p_expires_on is null then 'unknown'
    when p_expires_on < current_date then
      case when p_renewal_started_on is not null then 'renewal_pending' else 'expired' end
    when p_expires_on <= current_date + 90 then
      case when p_renewal_started_on is not null then 'renewal_pending' else 'expiring_soon' end
    else 'valid'
  end
$fn$;

/**
 * Days remaining. Negative once expired, which is what drives the escalating
 * reminders (90, 30, 14, 7, 1, 0, then daily) the brief asks for.
 */
create or replace function app.compliance_days_remaining(p_expires_on date)
returns integer
language sql immutable
as $fn$
  select case when p_expires_on is null then null else (p_expires_on - current_date) end
$fn$;

grant execute on function app.compliance_status(date, date) to hagroup_app;
grant execute on function app.compliance_days_remaining(date) to hagroup_app;

-- ---------------------------------------------------------------------------
-- The certificate types named in the brief.
--
-- Seeded as ACTIVE rather than draft: unlike the values extracted from
-- historical documents, these are not company facts that could be wrong. They
-- are the list of regulators HA GROUP deals with, and an Administrator can add,
-- rename or deactivate any of them. No expiry date or certificate number is
-- assumed — those are entered from the actual certificates.
-- ---------------------------------------------------------------------------
insert into public.compliance_types (code, label, authority, description, default_validity_months, reminder_days, sort_order)
values
  ('TRA_TAX_CLEARANCE', 'Tax Clearance Certificate', 'Tanzania Revenue Authority (TRA)',
   'Annual tax clearance required for tenders and contract award.', 12, '90,30,14,7,1,0', 10),
  ('BRELA', 'Business Registration', 'BRELA',
   'Company registration and annual returns.', 12, '90,30,14,7,1,0', 20),
  ('BUSINESS_LICENCE', 'Business Licence', 'Local Government Authority',
   'Trading licence for the registered business premises.', 12, '90,30,14,7,1,0', 30),
  ('OSHA', 'OSHA Compliance Certificate', 'Occupational Safety and Health Authority',
   'Workplace registration and safety compliance.', 12, '90,30,14,7,1,0', 40),
  ('WCF', 'Workers Compensation Fund', 'WCF',
   'Employer registration and contribution compliance.', 12, '90,30,14,7,1,0', 50),
  ('NSSF', 'National Social Security Fund', 'NSSF',
   'Employer registration and contribution compliance.', 12, '90,30,14,7,1,0', 60),
  ('INSURANCE_LIABILITY', 'Public Liability Insurance', 'Insurer',
   'Cover required on client sites.', 12, '90,60,30,14,7,1,0', 70),
  ('INSURANCE_WORKMEN', 'Workmen''s Compensation Insurance', 'Insurer',
   'Cover for site personnel.', 12, '90,60,30,14,7,1,0', 80),
  ('CONTRACTOR_REGISTRATION', 'Contractors Registration Board', 'CRB',
   'Contractor class registration and annual renewal.', 12, '90,30,14,7,1,0', 90)
on conflict (code) do nothing;
