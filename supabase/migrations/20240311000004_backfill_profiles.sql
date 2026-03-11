-- Backfill missing profiles for users who have a role but no profile record
INSERT INTO public.profiles (user_id, email, full_name)
SELECT ur.user_id, u.email, u.raw_user_meta_data->>'full_name'
FROM public.user_roles ur
JOIN auth.users u ON ur.user_id = u.id
LEFT JOIN public.profiles p ON ur.user_id = p.user_id
WHERE p.user_id IS NULL;

-- Update emails for all profiles from auth.users to ensure consistency
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
AND (p.email IS NULL OR p.email <> u.email);
