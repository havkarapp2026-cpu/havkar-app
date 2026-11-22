-- Allow each signed-in user to create their own profiles row.
-- Without INSERT, marketplace sellers cannot persist a public display name/avatar
-- when the signup trigger did not create a row.

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

GRANT INSERT ON TABLE public.profiles TO authenticated;
