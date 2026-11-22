-- Staff Workspace overview (no bank/SORAN/finance secrets) + Owner finance ledger summary.

CREATE OR REPLACE FUNCTION public.havkar_staff_workspace_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_name text := public.havkar_session_role();
BEGIN
  IF role_name IS NULL OR role_name = 'user' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF role_name NOT IN ('owner', 'admin', 'staff', 'support') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'role', role_name,
    'generated_at', pg_catalog.now(),
    'workspace', 'staff',
    'overview', jsonb_build_object(
      'support_requests', (SELECT count(*)::int FROM public.support_requests),
      'events', (SELECT count(*)::int FROM public.events),
      'tickets', (SELECT count(*)::int FROM public.event_tickets),
      'ads', (SELECT count(*)::int FROM public.ads),
      'business_applications', (SELECT count(*)::int FROM public.business_applications)
    ),
    'moderation', jsonb_build_object(
      'ad_reports', (SELECT count(*)::int FROM public.ad_reports),
      'service_complaints', (SELECT count(*)::int FROM public.service_complaints),
      'privacy_requests', (SELECT count(*)::int FROM public.privacy_requests),
      'accommodation_reports', (SELECT count(*)::int FROM public.accommodation_reports)
    ),
    'support_queue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sr.id,
        'topic', sr.topic,
        'status', sr.status,
        'created_at', sr.created_at
      ) ORDER BY sr.created_at DESC)
      FROM (
        SELECT id, topic, status, created_at
        FROM public.support_requests
        ORDER BY created_at DESC
        LIMIT 40
      ) sr
    ), '[]'::jsonb),
    'forbidden', jsonb_build_object(
      'bank_details', false,
      'soran_mailbox', false,
      'role_changes', false,
      'payment_arming', false
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.havkar_owner_finance_ledger_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT havkar_private.caller_is_owner() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'stellar', jsonb_build_object(
      'intents_total', (SELECT count(*)::int FROM public.marketplace_payment_intents),
      'mainnet_settled', (
        SELECT count(*)::int FROM public.marketplace_payment_intents
        WHERE network = 'mainnet' AND status = 'settled'
      ),
      'mainnet_unpaid', (
        SELECT count(*)::int FROM public.marketplace_payment_intents
        WHERE network = 'mainnet' AND status = 'unpaid'
      ),
      'testnet_settled', (
        SELECT count(*)::int FROM public.marketplace_payment_intents
        WHERE network = 'testnet' AND status = 'settled'
      ),
      'note', 'XLM settlements are not EUR bank deposits. Conversion and Revolut transfer are separate Owner actions.'
    ),
    'commissions', jsonb_build_object(
      'service_uncollected', (
        SELECT count(*)::int FROM public.service_commission_entries
        WHERE collection_state = 'uncollected'
      ),
      'service_entries_total', (SELECT count(*)::int FROM public.service_commission_entries)
    ),
    'subscriptions', jsonb_build_object(
      'ai', (SELECT count(*)::int FROM public.ai_subscriptions),
      'jobs', (SELECT count(*)::int FROM public.job_subscriptions)
    ),
    'wallet_rows', (SELECT count(*)::int FROM public.wallet_transactions),
    'event_tickets', jsonb_build_object(
      'total', (SELECT count(*)::int FROM public.event_tickets),
      'paid_valid', (
        SELECT count(*)::int FROM public.event_tickets
        WHERE payment_status = 'paid' AND ticket_status = 'valid'
      ),
      'pending_holds', (
        SELECT count(*)::int FROM public.event_tickets
        WHERE payment_status = 'pending' AND ticket_status = 'pending'
          AND (hold_expires_at IS NULL OR hold_expires_at > now())
      )
    ),
    'settlement_bank', jsonb_build_object(
      'public_disclosure', false,
      'instruction', 'Attach Revolut Business EUR as Stripe payout destination in Stripe Dashboard. Never store IBAN in app UI or public git.'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.havkar_staff_workspace_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.havkar_owner_finance_ledger_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.havkar_staff_workspace_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.havkar_owner_finance_ledger_summary() TO authenticated;
