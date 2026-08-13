import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  branch_id: string | null;
  salary: number;
  advance_pct: number;
  active: boolean;
};

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  isAdmin: boolean;
  branchName: string | null;
  refresh: () => void;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  loading: true,
  profile: null,
  isAdmin: false,
  branchName: null,
  refresh: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
      qc.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user.id ?? null;

  const { data } = useQuery({
    queryKey: ["me", uid],
    enabled: !!uid,
    queryFn: async () => {
      const [{ data: profile, error: pe }, { data: roles, error: re }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, email, branch_id, salary, advance_pct, active")
          .eq("id", uid!)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid!),
      ]);
      if (pe) throw pe;
      if (re) throw re;
      let branchName: string | null = null;
      if (profile?.branch_id) {
        const { data: b } = await supabase
          .from("branches")
          .select("name")
          .eq("id", profile.branch_id)
          .maybeSingle();
        branchName = b?.name ?? null;
      }
      return {
        profile: (profile as Profile | null) ?? null,
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
        branchName,
      };
    },
  });

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      loading,
      profile: data?.profile ?? null,
      isAdmin: data?.isAdmin ?? false,
      branchName: data?.branchName ?? null,
      refresh: () => qc.invalidateQueries(),
    }),
    [session, loading, data, qc],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export async function signOutEverywhere(qc: ReturnType<typeof useQueryClient>) {
  await qc.cancelQueries();
  qc.clear();
  await supabase.auth.signOut();
}
