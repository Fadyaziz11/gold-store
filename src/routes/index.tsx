import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    throw redirect({ to: isAdmin ? "/admin" : "/app" });
  },
  head: () => ({
    meta: [
      { title: "نظام إدارة الفروع والخزنة | الشركة" },
      {
        name: "description",
        content: "نظام مالي متكامل لإدارة الفروع، الخزنة الرئيسية، المبيعات، التحويلات والمرتبات.",
      },
      { property: "og:title", content: "نظام إدارة الفروع والخزنة | الشركة" },
      {
        property: "og:description",
        content: "نظام مالي متكامل لإدارة الفروع، الخزنة الرئيسية، المبيعات، التحويلات والمرتبات.",
      },
    ],
  }),
  component: () => null,
});
