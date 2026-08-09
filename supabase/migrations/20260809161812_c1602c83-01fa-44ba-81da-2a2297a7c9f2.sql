-- Trigger-only functions: no direct API execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Role check helper: only signed-in users (needed by RLS policies)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Reference data lookup: signed-in users only
REVOKE ALL ON FUNCTION public.get_distinct_water_bodies(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_distinct_water_bodies(text, text) TO authenticated;