
-- 1. Clean up existing default data (if any, since it won't match new users)
TRUNCATE TABLE public.user_settings;

-- 2. Alter user_settings to use auth.users(id) as primary key
ALTER TABLE public.user_settings
    ALTER COLUMN id DROP DEFAULT,
    ADD CONSTRAINT user_settings_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Create Trigger Function to auto-create settings for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (id, provider, from_email, from_name)
  VALUES (
    NEW.id,
    'shared-ses',
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach Trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
