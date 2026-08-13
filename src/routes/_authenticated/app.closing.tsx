import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg, methodLabel, useOpenShift, useShiftSummary } from "@/lib/queries";
import { EGP, cairoToday, fmtDateTime } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/closing")({
  component: ClosingPage,
});

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "success" | "destructive" | "primary";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "primary"
          ? "text-primary"
          : "";
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className={strong ? "text-sm font-bold" : "text-sm text-muted-foreground"}>{label}</span>
      <span className={`num ${strong ? "text-base font-extrabold" : "text-sm font-semibold"} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function ClosingPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const branchId = profile?.branch_id ?? null;
  const today = cairoToday();
  const { data: shift } = useOpenShift(profile?.id);
  const { data: s } = useShiftSummary(shift?.id);
  const [cashSales, setCashSales] = useState("");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");

  // closing already submitted for the current open shift
  const { data: shiftClosing } = useQuery({
    queryKey: ["shift-closing", shift?.id],
    enabled: !!shift?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("*")
        .eq("attendance_id", shift!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["my-closings", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("*")
        .eq("employee_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  // shift expenses / supplier payments detail
  const { data: details } = useQuery({
    queryKey: ["shift-details", shift?.id],
    enabled: !!shift?.id,
    queryFn: async () => {
      const [ex, sp, tr] = await Promise.all([
        supabase.from("expenses").select("*, expense_categories(name)").eq("attendance_id", shift!.id),
        supabase.from("supplier_payments").select("*, suppliers(name)").eq("attendance_id", shift!.id),
        supabase.from("transfers").select("*").eq("attendance_id", shift!.id),
      ]);
      if (ex.error) throw ex.error;
      if (sp.error) throw sp.error;
      if (tr.error) throw tr.error;
      return { expenses: ex.data, suppliers: sp.data, transfers: tr.data };
    },
  });

  const cash = cashSales === "" ? 0 : Number(cashSales);
  const transfersTotal = Number(s?.transfers_total ?? 0);
  const expensesCash = Number(s?.expenses_cash ?? 0);
  const supplierCash = Number(s?.supplier_cash ?? 0);
  const advBranch = Number(s?.advances_branch ?? 0);
  const totalSales = cash + transfersTotal;
  const expected = cash - expensesCash - supplierCash - advBranch;
  const netTotal = expected + transfersTotal;
  const diff = actual === "" ? 0 : Number(actual) - expected;

  const submit = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("لم يتم تعيين فرع لحسابك");
      if (!shift) throw new Error("لازم تفتح وردية قبل عمل التقفيلة.");
      if (cashSales === "" || !Number.isFinite(cash) || cash < 0)
        throw new Error("أدخل إجمالي مبيعات الكاش لليوم");
      const v = Number(actual);
      if (actual === "" || !Number.isFinite(v) || v < 0) throw new Error("أدخل مبلغ الكاش الفعلي في الدرج");
      if (Math.abs(v - expected) > 0.009 && !notes.trim())
        throw new Error("يوجد فرق بين الكاش الفعلي والمتوقع — اكتب سبب الفرق قبل الإرسال.");
      const { error } = await supabase.from("daily_closings").insert({
        branch_id: branchId,
        employee_id: profile!.id,
        attendance_id: shift.id,
        closing_date: today,
        cash_sales: cash,
        actual_cash: v,
        expected_cash: 0,
        difference: 0,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال التقفيلة للمراجعة");
      setCashSales("");
      setActual("");
      setNotes("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">تقفيلة الوردية</h1>
        <p className="text-xs text-muted-foreground">
          {shift ? `وردية مفتوحة منذ ${fmtDateTime(shift.check_in_at)}` : "لا توجد وردية مفتوحة"}
        </p>
      </div>

      {!shift ? (
        <Card className="gap-3 p-4">
          <p className="text-sm font-semibold text-warning">
            مش هتقدر تعمل تقفيلة من غير وردية مفتوحة. سجّل حضورك داخل الفرع الأول.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/app/attendance">الذهاب للحضور والانصراف</Link>
          </Button>
        </Card>
      ) : shiftClosing ? (
        <Card className="gap-0 p-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-bold">حالة تقفيلة الوردية</span>
            <StatusBadge status={shiftClosing.status} />
          </div>
          <Row label="مبيعات كاش" value={EGP(shiftClosing.cash_sales)} />
          <Row label="إنستاباي" value={EGP(shiftClosing.instapay_sales)} />
          <Row label="محفظة" value={EGP(shiftClosing.wallet_sales)} />
          <Row label="إجمالي التحويلات" value={EGP(shiftClosing.transfer_total)} tone="primary" />
          <Row label="إجمالي المبيعات" value={EGP(shiftClosing.total_sales)} strong />
          <Row label="المصاريف النقدية" value={`- ${EGP(shiftClosing.expenses_total)}`} tone="destructive" />
          <Row label="مدفوعات موردين (كاش)" value={`- ${EGP(shiftClosing.supplier_cash_total)}`} tone="destructive" />
          <Row label="صافي الكاش المطلوب" value={EGP(shiftClosing.expected_cash)} strong />
          <Row label="الكاش الفعلي" value={EGP(shiftClosing.actual_cash)} />
          <Row label="الفرق" value={EGP(shiftClosing.difference)} strong tone={Number(shiftClosing.difference) < 0 ? "destructive" : "success"} />
          <Row label="إجمالي صافي اليوم" value={EGP(shiftClosing.net_total)} strong tone="primary" />
          {shiftClosing.notes ? (
            <p className="pt-2 text-xs text-muted-foreground">ملاحظاتك: {shiftClosing.notes}</p>
          ) : null}
          {shiftClosing.rejection_reason ? (
            <p className="pt-2 text-xs text-destructive">ملاحظة الإدارة: {shiftClosing.rejection_reason}</p>
          ) : null}
          {shiftClosing.admin_notes ? (
            <p className="pt-2 text-xs text-muted-foreground">تعليق الإدارة: {shiftClosing.admin_notes}</p>
          ) : null}
        </Card>
      ) : (
        <>
          <Card className="gap-0 p-4">
            <p className="pb-2 text-sm font-bold">ملخص المبيعات (تلقائي من عملياتك)</p>
            <Row label="إنستاباي" value={EGP(s?.instapay)} />
            <Row label="محفظة إلكترونية" value={EGP(s?.wallet)} />
            <Row label="تحويلات أخرى" value={EGP(s?.other_transfers)} />
            <Row label="إجمالي التحويلات" value={EGP(transfersTotal)} strong tone="primary" />
          </Card>

          <Card className="gap-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="cash">إجمالي مبيعات الكاش لليوم (ج.م)</Label>
              <Input
                id="cash"
                inputMode="decimal"
                dir="ltr"
                value={cashSales}
                onChange={(e) => setCashSales(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-[11px] text-muted-foreground">
                اكتب إجمالي الكاش اللي بعته طول اليوم مرة واحدة — مش محتاج تسجل كل فاتورة لوحدها.
              </p>
            </div>
            <div className="border-t pt-2">
              <Row label="إجمالي المبيعات (كاش + تحويلات)" value={EGP(totalSales)} strong />
            </div>
          </Card>

          <Card className="gap-0 p-4">
            <p className="pb-2 text-sm font-bold">المصاريف والمدفوعات</p>
            {(details?.expenses ?? []).map((e) => (
              <Row
                key={e.id}
                label={`${e.expense_categories?.name ?? "مصروف"} — ${e.description ?? ""} (${e.payment_method === "cash" ? "كاش" : "تحويل"})`}
                value={EGP(e.amount)}
              />
            ))}
            {(details?.suppliers ?? []).map((p) => (
              <Row
                key={p.id}
                label={`مورد: ${p.suppliers?.name ?? ""} (${p.payment_method === "cash" ? "كاش" : "تحويل"})`}
                value={EGP(p.amount)}
              />
            ))}
            {advBranch > 0 ? <Row label="سلفة من كاش الفرع" value={EGP(advBranch)} /> : null}
            <Row label="إجمالي المصاريف النقدية" value={EGP(expensesCash)} strong tone="destructive" />
            <Row label="مدفوعات موردين (كاش)" value={EGP(supplierCash)} strong tone="destructive" />
            {!details?.expenses.length && !details?.suppliers.length ? (
              <p className="py-3 text-center text-xs text-muted-foreground">لا توجد مصاريف في هذه الوردية.</p>
            ) : null}
          </Card>

          <Card className="gap-0 p-4">
            <p className="pb-2 text-sm font-bold">النتيجة</p>
            <Row label="صافي الكاش المطلوب" value={EGP(expected)} strong />
            <Row label="إجمالي التحويلات" value={EGP(transfersTotal)} />
            <Row label="إجمالي صافي اليوم" value={EGP(netTotal)} strong tone="primary" />
          </Card>

          <Card className="gap-4 p-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="actual">الكاش الفعلي الموجود معك (ج.م)</Label>
                <Input
                  id="actual"
                  inputMode="decimal"
                  dir="ltr"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {actual !== "" ? (
                <div
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${
                    Math.abs(diff) < 0.01
                      ? "bg-success/10 text-success"
                      : diff > 0
                        ? "bg-warning/10 text-warning"
                        : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {Math.abs(diff) < 0.01
                    ? "مطابق تماماً"
                    : diff > 0
                      ? `زيادة ${EGP(diff)}`
                      : `عجز ${EGP(Math.abs(diff))}`}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="notes">سبب الفرق / ملاحظات</Label>
                <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={submit.isPending}>
                {submit.isPending ? "جارٍ الإرسال..." : "إرسال التقفيلة للمراجعة"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                التقفيلة بتروح للمدير للمراجعة، والفلوس ما بتتسجلش في الخزنة الرئيسية إلا بعد اعتماده.
              </p>
            </form>
          </Card>

          {(details?.transfers ?? []).length ? (
            <Card className="gap-0 p-4">
              <p className="pb-2 text-sm font-bold">تفاصيل التحويلات</p>
              {details!.transfers.map((t) => (
                <Row key={t.id} label={`${methodLabel(t.method)} — ${fmtDateTime(t.created_at)}`} value={EGP(t.amount)} />
              ))}
            </Card>
          ) : null}
        </>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-bold">سجل تقفيلاتي</h2>
        {(history ?? []).map((c) => (
          <Card key={c.id} className="gap-1 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{fmtDateTime(c.created_at)}</span>
              <StatusBadge status={c.status} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>مبيعات {EGP(c.total_sales)}</span>
              <span>صافي {EGP(c.net_total)}</span>
              <span className={Number(c.difference) < 0 ? "text-destructive" : ""}>فرق {EGP(c.difference)}</span>
            </div>
          </Card>
        ))}
        {history && history.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">لا توجد تقفيلات سابقة.</p>
        ) : null}
      </div>
    </div>
  );
}
