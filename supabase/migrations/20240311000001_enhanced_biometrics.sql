-- Add device metadata and active status to user_biometrics
ALTER TABLE public.user_biometrics
ADD COLUMN IF NOT EXISTS device_name TEXT,
ADD COLUMN IF NOT EXISTS device_type TEXT,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- Update RLS policy to allow users to update their own active status (for deactivation)
CREATE POLICY "Users can update their own biometrics active status"
    ON public.user_biometrics FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
