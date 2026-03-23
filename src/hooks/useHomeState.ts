import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useHomeState = () => {
  const { user } = useAuth();
  const [homeState, setHomeState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from("profiles")
      .select("home_state")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setHomeState((data as any)?.home_state ?? null);
        setLoading(false);
      });
  }, [user]);

  const updateHomeState = useCallback(async (state: string) => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ home_state: state } as any)
      .eq("user_id", user.id);
    setHomeState(state);
  }, [user]);

  return { homeState, loading, updateHomeState };
};
