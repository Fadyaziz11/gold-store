import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, signOutEverywhere } from "@/lib/auth";
import { EGP } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/account")({
  component: AccountPage,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function AccountPage() {
  const { profile, branchName, isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: payroll } = useQuery({
    queryKey: ["my-payroll", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll")
        .select("*")
        .eq("employee_id", profile!.id)
        .order("period", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">حسابي</h1>
      <Card className="gap-0 p-4">
        <Row label="الاسم" value={profile?.full_name ?? "-"} />
        <Row label="البريد الإلكتروني" value={profile?.email ?? "-"} />
        <Row label="رقم الهاتف" value={profile?.phone ?? "-"} />
        <Row label="الفرع" value={branchName ?? "غير محدد"} />
        <Row label="الراتب الشهري" value={EGP(profile?.salary)} />
        <Row label="الصلاحية" value={isAdmin ? "مدير" : "موظف"} />
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">كشوف المرتبات</h2>
        {(payroll ?? []).map((p) => (
          <Card key={p.id} className="gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="num text-sm font-bold">{p.period}</span>
              <StatusBadge status={p.status} />
            </div>
            <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              <span>الأساسي: {EGP(p.base_salary)}</span>
              <span>السلف: {EGP(p.advances)}</span>
              <span>الخصومات: {EGP(p.deductions)}</span>
              <span>المكافآت: {EGP(p.bonuses)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-sm">
              <span>الصافي</span>
              <span className="num font-extrabold text-primary">{EGP(p.net_salary)}</span>
            </div>
          </Card>
        ))}
        {payroll && payroll.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">لا توجد كشوف مرتبات بعد.</p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        بيانات الفرع والراتب تُدار بواسطة الإدارة فقط.
      </p>
      <Button
        variant="destructive"
        className="w-full"
        onClick={async () => {
          await signOutEverywhere(qc);
          navigate({ to: "/auth", replace: true });
        }}
      >
        <LogOut className="size-4" /> تسجيل الخروج
      </Button>
    </div>
  );
}
