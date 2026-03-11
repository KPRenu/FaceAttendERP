-- 1. Update the table defaults for future-proofing
-- This ensures that if the frontend falls back, the database uses these values.
ALTER TABLE public.class_code_locations ALTER COLUMN radius SET DEFAULT 150;
ALTER TABLE public.class_code_locations ALTER COLUMN accuracy_threshold SET DEFAULT 300;

-- 2. Update all existing records to the new standard
-- This ensures currently active class codes follow the new rules immediately.
UPDATE public.class_code_locations 
SET radius = 150, 
    accuracy_threshold = 300;


-- // Store location mapping
--     if (locationData && newCode) {
--       const { error: locError } = await supabase.from("class_code_locations").insert({
--         class_code_id: newCode.id,
--         latitude: locationData.latitude,
--         longitude: locationData.longitude,
--         radius: 150, // Valid within 150m
--         accuracy_threshold: 300 // Accept signals with up to 300m error
--       });

--       //checking GPS accuracy and accuracy can be changed in the future
--       if (locationData.accuracy > 300) {
--         toast({ title: "GPS Inaccurate", description: "Please ensure you have a clearer GPS signal (Accuracy > 300m).", variant: "destructive" });
--         setVerifying(false);
--         return;
--       }
--     } catch (locErr: any) {
--       toast({ title: "Location Error", description: locErr.message, variant: "destructive" });
--       setVerifying(false);
--       return;
--     }