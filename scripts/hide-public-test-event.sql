-- DO NOT RUN AGAINST PRODUCTION UNTIL THE OWNER APPROVES THIS STATEMENT.
-- This hides public.events id 1 from anonymous and other users.
-- It does not delete the event, its tickets, Stripe references, or payment history.
-- The public read policy already requires is_public = true AND status = 'active'.

BEGIN;

UPDATE public.events
SET is_public = false
WHERE id = 1
  AND title = 'HAVKAR Test Event'
  AND status = 'active'
  AND is_public IS TRUE;

-- Stop here and confirm the update count is 1 before committing.
-- The ticket and payment tables are intentionally not modified.
-- ROLLBACK this prepared transaction unless the owner has approved the commit.
