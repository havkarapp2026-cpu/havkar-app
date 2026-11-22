-- Applications only against publicly active, non-expired jobs.
drop policy if exists job_applications_insert_own on public.job_applications;
create policy job_applications_insert_own
  on public.job_applications
  for insert
  to authenticated
  with check (
    applicant_id = auth.uid()
    and exists (
      select 1
      from public.jobs j
      where j.id = job_id
        and j.status = 'active'
        and (j.expires_at is null or j.expires_at > now())
        and j.user_id is distinct from auth.uid()
    )
  );
