import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, methodLabel } from "@/lib/queries";
import { EGP, fmtDate, fmtDateTime } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { ProofViewer } from "@/components/ProofViewer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Check, RotateCcw, Save, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/closings")({
  component: ClosingsAdmin,
});

type ClosingStatus = "pending" | "approved" | "rejected" | "correction";

type ClosingPatch = {
  cash_sales: number;
  actual_cash: number;
  admin_notes: string | null;
  status: ClosingStatus;
  rejection_reason?: string | null;
};

type ClosingRow = {
  id: string;
  branch_id: string;
  employee_id: string;
  attendance_id: string | null;
  closing_date: string;
  shift_start: string | null;
  shift_end: string | null;
  cash_sales: number;
  instapay_sales: number;
  wallet_sales: number;
  other_transfer_sales: number;
  transfer_total: number;
  total_sales: number;
  expenses_total: number;
  supplier_cash_total: number;
  advances_branch: number;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  net_total: number;
  status: ClosingStatus;
  notes: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  reopened_count: number;
  branches: { name: string } | null;
  profiles: { full_name: string } | null;
};

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`num text-xs font-bold ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function ClosingCard({ c }: { c: ClosingRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cash, setCash] = useState(String(c.cash_sales));
  const [actual, setActual] = useState(String(c.actual_cash));
  const [adminNotes, setAdminNotes] = useState(c.admin_notes ?? "");
  const [reason, setReason] = useState("");

  const { data: details } = useQuery({
    queryKey: ["closing-details", c.id, c.attendance_id],
    enabled: open && !!c.attendance_id,
    queryFn: async () => {
      const [ex, sp, tr, st] = await Promise.all([
        supabase.from("expenses").select("*, expense_categories(name)").eq("attendance_id", c.attendance_id!),
        supabase.from("supplier_payments").select("*, suppliers(name)").eq("attendance_id", c.attendance_id!),
        supabase.from("transfers").select("*").eq("attendance_id", c.attendance_id!),
        supabase.from("treasury_settlements").select("*").eq("closing_id", c.id).order("created_at"),
      ]);
      if (ex.error) throw ex.error;
      if (sp.error) throw sp.error;
      if (tr.error) throw tr.error;
      if (st.error) throw st.error;
      return { expenses: ex.data, suppliers: sp.data, transfers: tr.data, settlements: st.data };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: ClosingPatch) => {
      const { error } = await supabase.from("daily_closings").update(patch).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ التعديل وإعادة حساب التقفيلة");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const base = () => ({
    cash_sales: Number(cash) || 0,
    actual_cash: Number(actual) || 0,
    admin_notes: adminNotes.trim() || null,
  });

  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">
            {c.branches?.name} — {c.profiles?.full_name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {fmtDate(c.closing_date)} · وردية {fmtDateTime(c.shift_start)} ← {fmtDateTime(c.shift_end)}
            {c.reopened_count > 0 ? ` · أُعيد فتحها ${c.reopened_count} مرة` : ""}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <Line label="مبيعات كاش" value={EGP(c.cash_sales)} />
        <Line label="إنستاباي" value={EGP(c.instapay_sales)} />
        <Line label="محفظة" value={EGP(c.wallet_sales)} />
        <Line label="تحويلات أخرى" value={EGP(c.other_transfer_sales)} />
        <Line label="إجمالي التحويلات" value={EGP(c.transfer_total)} tone="text-primary" />
        <Line label="إجمالي المبيعات" value={EGP(c.total_sales)} tone="text-success" />
        <Line label="مصاريف نقدية" value={EGP(c.expenses_total)} tone="text-destructive" />
        <Line label="مدفوعات موردين (كاش)" value={EGP(c.supplier_cash_total)} tone="text-destructive" />
        <Line label="سلف من كاش الفرع" value={EGP(c.advances_branch)} tone="text-destructive" />
        <Line label="الكاش المتوقع" value={EGP(c.expected_cash)} />
        <Line label="الكاش الفعلي" value={EGP(c.actual_cash)} />
        <Line
          label="الفرق"
          value={EGP(c.difference)}
          tone={Number(c.difference) < 0 ? "text-destructive" : Number(c.difference) > 0 ? "text-warning" : "text-success"}
        />
        <Line label="إجمالي صافي اليوم" value={EGP(c.net_total)} tone="text-primary" />
      </div>

      {c.notes ? <p className="text-xs text-muted-foreground">ملاحظة الموظف: {c.notes}</p> : null}
      {c.rejection_reason ? <p className="text-xs text-destructive">سبب الرفض: {c.rejection_reason}</p> : null}

      <Button size="sm" variant="ghost" className="self-start" onClick={() => setOpen((o) => !o)}>
        {open ? "إخفاء التفاصيل" : "عرض كل العمليات والتعديل"}
      </Button>

      {open ? (
        <div className="space-y-3 border-t pt-3">
          <div>
            <p className="mb-1 text-xs font-bold">التحويلات</p>
            {(details?.transfers ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b py-1 text-xs">
                <span>
                  {methodLabel(t.method)} · {fmtDateTime(t.created_at)} {t.customer_ref ? `· ${t.customer_ref}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="num font-bold">{EGP(t.amount)}</span>
                  <ProofViewer path={t.proof_path} />
                </span>
              </div>
            ))}
            {!details?.transfers.length ? <p className="text-[11px] text-muted-foreground">لا يوجد</p> : null}
          </div>

          <div>
            <p className="mb-1 text-xs font-bold">المصاريف</p>
            {(details?.expenses ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b py-1 text-xs">
                <span>
                  {e.expense_categories?.name ?? "بند"} · {e.description ?? ""} ·{" "}
                  {e.payment_method === "cash" ? "كاش" : "تحويل"}
                </span>
                <span className="flex items-center gap-2">
                  <span className="num font-bold">{EGP(e.amount)}</span>
                  {e.proof_path ? <ProofViewer path={e.proof_path} label="إيصال" /> : null}
                </span>
              </div>
            ))}
            {!details?.expenses.length ? <p className="text-[11px] text-muted-foreground">لا يوجد</p> : null}
          </div>

          <div>
            <p className="mb-1 text-xs font-bold">دفعات الموردين</p>
            {(details?.suppliers ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b py-1 text-xs">
                <span>
                  {p.suppliers?.name} · {p.payment_method === "cash" ? "كاش" : "تحويل"}
                </span>
                <span className="num font-bold">{EGP(p.amount)}</span>
              </div>
            ))}
            {!details?.suppliers.length ? <p className="text-[11px] text-muted-foreground">لا يوجد</p> : null}
          </div>

          <div>
            <p className="mb-1 text-xs font-bold">تسويات الخزنة الرئيسية</p>
            {(details?.settlements ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b py-1 text-xs">
                <span>
                  {s.status === "active" ? "تسوية سارية" : "تسوية معكوسة"} · {fmtDateTime(s.created_at)}
                </span>
                <span className="num font-bold">{EGP(s.amount)}</span>
              </div>
            ))}
            {!details?.settlements.length ? (
              <p className="text-[11px] text-muted-foreground">لم يتم ترحيل أي مبلغ للخزنة بعد.</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>تصحيح مبيعات الكاش</Label>
              <Input dir="ltr" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>تصحيح الكاش الفعلي</Label>
              <Input dir="ltr" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>ملاحظات الإدارة</Label>
            <Textarea rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ ...base(), status: c.status })}
            >
              <Save className="size-4" /> حفظ التعديل وإعادة الحساب
            </Button>
            {c.status !== "approved" ? (
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() => save.mutate({ ...base(), status: "approved", rejection_reason: null })}
              >
                <Check className="size-4" /> اعتماد وترحيل للخزنة
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate({ ...base(), status: "correction" })}
              >
                <RotateCcw className="size-4" /> إعادة فتح وعكس التسوية
              </Button>
            )}
            <Input
              className="h-9 w-44"
              placeholder="سبب الرفض"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={save.isPending}
              onClick={() => {
                if (!reason.trim()) {
                  toast.error("اكتب سبب الرفض");
                  return;
                }
                save.mutate({ ...base(), status: "rejected", rejection_reason: reason.trim() });
              }}
            >
              <X className="size-4" /> رفض
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ClosingsAdmin() {
  const [tab, setTab] = useState("pending");

  const { data } = useQuery({
    queryKey: ["admin-closings", tab],
    queryFn: async () => {
      let q = supabase
        .from("daily_closings")
        .select("*, branches(name), profiles!daily_closings_employee_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (tab !== "all") q = q.eq("status", tab as ClosingStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ClosingRow[];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">التقفيلات</h1>
        <p className="text-xs text-muted-foreground">
          لا يتم ترحيل أي مبلغ إلى الخزنة الرئيسية إلا بعد اعتمادك للتقفيلة.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="pending">بانتظار المراجعة</TabsTrigger>
          <TabsTrigger value="approved">معتمدة</TabsTrigger>
          <TabsTrigger value="correction">مطلوب تصحيح</TabsTrigger>
          <TabsTrigger value="rejected">مرفوضة</TabsTrigger>
          <TabsTrigger value="all">الكل</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {(data ?? []).map((c) => (
          <ClosingCard key={c.id} c={c} />
        ))}
        {data && data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">لا توجد تقفيلات في هذه الحالة.</p>
        ) : null}
      </div>
    </div>
  );
}
