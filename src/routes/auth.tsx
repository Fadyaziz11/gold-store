import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | نظام إدارة الفروع" },
      { name: "description", content: "تسجيل دخول الموظفين والإدارة إلى نظام إدارة الفروع والخزنة." },
      { property: "og:title", content: "تسجيل الدخول | نظام إدارة الفروع" },
      { property: "og:description", content: "تسجيل دخول الموظفين والإدارة إلى النظام المالي." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { session, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) navigate({ to: isAdmin ? "/admin" : "/app", replace: true });
  }, [session, isAdmin, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("البريد الإلكتروني وكلمة المرور مطلوبان");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new Error("بيانات الدخول غير صحيحة");
      toast.success("تم تسجيل الدخول");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="gold-gradient mx-auto flex size-16 items-center justify-center rounded-2xl text-2xl font-extrabold text-primary-foreground shadow-lg">
            ج
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">نظام إدارة الفروع</h1>
          <p className="mt-1 text-sm text-muted-foreground">الخزنة الرئيسية · المبيعات · التقفيلة</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>تسجيل الدخول</CardTitle>
            <CardDescription>أدخل بيانات الحساب التي أنشأتها الإدارة للمتابعة</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "جارٍ الدخول..." : "دخول"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
