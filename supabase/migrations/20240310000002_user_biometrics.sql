-- Create user_biometrics table
CREATE TABLE IF NOT EXISTS public.user_biometrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_biometrics ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own biometrics"
    ON public.user_biometrics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own biometrics"
    ON public.user_biometrics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own biometrics"
    ON public.user_biometrics FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all biometrics"
    ON public.user_biometrics FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    ));

CREATE POLICY "Admins can update biometric status"
    ON public.user_biometrics FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    ));
