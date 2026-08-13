import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useEmployees } from "@/lib/queries";
import { EGP, fmtDate } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/payroll")({
  component: Payroll,
});

const thisMonth = () => new Date().toISOString().slice(0, 7);

function Payroll() {
  const qc = useQueryClient();
  const { data: employees } = useEmployees();
  const [period, setPeriod] = useState(thisMonth());

  const { data: advances } = useQuery({
    queryKey: ["all-advances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_advances")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: payroll } = useQuery({
    queryKey: ["payroll", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll")
        .select("*, profiles(full_name)")
        .eq("period", period)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const advancesFor = (employeeId: string) =>
    (advances ?? [])
      .filter(
        (a) =>
          a.employee_id === employeeId &&
          (a.status === "approved" || a.status === "paid") &&
          String(a.created_at).slice(0, 7) === period,
      )
      .reduce((sum, a) => sum + Number(a.amount), 0);

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("salary_advances")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل صرف السلفة");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const existing = new Set((payroll ?? []).map((p) => p.employee_id));
      const rows = (employees ?? [])
        .filter((e) => e.active && !existing.has(e.id))
        .map((e) => {
          const adv = advancesFor(e.id);
          return {
            employee_id: e.id,
            period,
            base_salary: Number(e.salary),
            advances: adv,
            deductions: 0,
            bonuses: 0,
            net_salary: Number(e.salary) - adv,
          };
        });
      if (rows.length === 0) throw new Error("لا يوجد موظفون جدد لإنشاء مرتباتهم لهذا الشهر");
      const { error } = await supabase.from("payroll").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إنشاء كشف المرتبات");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveRow = useMutation({
    mutationFn: async (row: { id: string; deductions: number; bonuses: number; base: number; adv: number }) => {
      const net = row.base - row.adv - row.deductions + row.bonuses;
      if (net < 0) throw new Error("صافي المرتب لا يمكن أن يكون بالسالب");
      const { error } = await supabase
        .from("payroll")
        .update({ deductions: row.deductions, bonuses: row.bonuses, net_salary: net })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الخصومات والمكافآت");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const payRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll").update({ status: "paid" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم صرف المرتب وخصمه من الخزنة الرئيسية");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">المرتبات والسلف</h1>

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>الشهر</Label>
            <Input dir="ltr" type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} />
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? "جارٍ الإنشاء..." : "إنشاء كشف المرتبات"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          صافي المرتب = الأساسي − السلف − الخصومات + المكافآت. عند الصرف يتم خصم المبلغ من الخزنة الرئيسية تلقائياً.
        </p>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">كشف مرتبات {period}</h2>
        {(payroll ?? []).map((p) => (
          <PayrollRow
            key={p.id}
            row={p}
            onSave={(deductions, bonuses) =>
              saveRow.mutate({
                id: p.id,
                deductions,
                bonuses,
                base: Number(p.base_salary),
                adv: Number(p.advances),
              })
            }
            onPay={() => payRow.mutate(p.id)}
            busy={saveRow.isPending || payRow.isPending}
          />
        ))}
        {payroll && payroll.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد كشف مرتبات لهذا الشهر بعد.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">سجل السلف</h2>
        {(advances ?? []).map((a) => (
          <Card key={a.id} className="flex-row flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="text-sm font-semibold">{a.profiles?.full_name}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtDate(a.created_at)} · {a.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="num text-sm font-bold">{EGP(a.amount)}</span>
              <StatusBadge status={a.status} />
              {a.status === "approved" ? (
                <Button size="sm" disabled={markPaid.isPending} onClick={() => markPaid.mutate(a.id)}>
                  تم الصرف
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
        {advances && advances.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد سلف مسجلة.</p>
        ) : null}
      </div>
    </div>
  );
}

type Row = {
  id: string;
  base_salary: number;
  advances: number;
  deductions: number;
  bonuses: number;
  net_salary: number;
  status: string;
  profiles: { full_name: string } | null;
};

function PayrollRow({
  row,
  onSave,
  onPay,
  busy,
}: {
  row: Row;
  onSave: (deductions: number, bonuses: number) => void;
  onPay: () => void;
  busy: boolean;
}) {
  const paid = row.status === "paid";
  const [ded, setDed] = useState(String(row.deductions));
  const [bon, setBon] = useState(String(row.bonuses));
  const net = Number(row.base_salary) - Number(row.advances) - (Number(ded) || 0) + (Number(bon) || 0);

  return (
    <Card className="gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{row.profiles?.full_name ?? "-"}</span>
        <StatusBadge status={row.status} />
      </div>
      <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
        <span>الأساسي: {EGP(row.base_salary)}</span>
        <span>السلف: {EGP(row.advances)}</span>
      </div>
      {paid ? (
        <div className="flex items-center justify-between text-sm">
          <span>صافي المرتب المصروف</span>
          <span className="num font-extrabold">{EGP(row.net_salary)}</span>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">خصومات</Label>
              <Input dir="ltr" inputMode="decimal" value={ded} onChange={(e) => setDed(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">مكافآت</Label>
              <Input dir="ltr" inputMode="decimal" value={bon} onChange={(e) => setBon(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>الصافي</span>
            <span className="num font-extrabold text-primary">{EGP(net)}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave(Number(ded) || 0, Number(bon) || 0)}>
              حفظ
            </Button>
            <Button size="sm" disabled={busy} onClick={onPay}>
              صرف من الخزنة
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
