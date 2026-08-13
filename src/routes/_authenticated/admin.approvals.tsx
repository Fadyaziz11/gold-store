import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/queries";
import { EGP, fmtDate, fmtDateTime } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProofViewer } from "@/components/ProofViewer";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  component: Approvals,
});

type Kind = "transfers" | "expenses" | "supplier_payments" | "daily_closings" | "salary_advances";

function usePending(kind: Kind, select: string) {
  return useQuery({
    queryKey: ["pending", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(kind)
        .select(select)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data as unknown as any[];
    },
  });
}

function useDecide(kind: Kind) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, approve, reason }: { id: string; approve: boolean; reason?: string }) => {
      if (!approve && !reason?.trim()) throw new Error("اكتب سبب الرفض");
      const now = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any =
        kind === "daily_closings"
          ? {
              status: approve ? "approved" : "rejected",
              reviewed_by: profile!.id,
              reviewed_at: now,
              rejection_reason: approve ? null : reason!.trim(),
            }
          : kind === "salary_advances"
            ? {
                status: approve ? "approved" : "rejected",
                approved_by: profile!.id,
                rejection_reason: approve ? null : reason!.trim(),
              }
            : {
                status: approve ? "approved" : "rejected",
                approved_by: profile!.id,
                approved_at: approve ? now : null,
                rejection_reason: approve ? null : reason!.trim(),
              };
      const { error } = await supabase.from(kind).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تنفيذ القرار");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

function DecideRow({ kind, id }: { kind: Kind; id: string }) {
  const decide = useDecide(kind);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-2">
      {rejecting ? (
        <>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="سبب الرفض"
            className="h-9 flex-1 min-w-40"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id, approve: false, reason })}
          >
            تأكيد الرفض
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            إلغاء
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id, approve: true })}>
            <Check className="size-4" /> اعتماد
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
            <X className="size-4" /> رفض
          </Button>
        </>
      )}
    </div>
  );
}

function Empty() {
  return <p className="py-8 text-center text-sm text-muted-foreground">لا توجد عناصر بانتظار المراجعة.</p>;
}

function Approvals() {
  const transfers = usePending("transfers", "*, branches(name), profiles!transfers_employee_id_fkey(full_name)");
  const expenses = usePending(
    "expenses",
    "*, branches(name), expense_categories(name), profiles!expenses_employee_id_fkey(full_name)",
  );
  const sup = usePending(
    "supplier_payments",
    "*, branches(name), suppliers(name), profiles!supplier_payments_employee_id_fkey(full_name)",
  );
  const closings = usePending(
    "daily_closings",
    "*, branches(name), profiles!daily_closings_employee_id_fkey(full_name)",
  );
  const advances = usePending("salary_advances", "*, profiles!salary_advances_employee_id_fkey(full_name, salary)");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">المراجعات والاعتمادات</h1>
      <Tabs defaultValue="transfers">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="transfers">تحويلات ({transfers.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="expenses">مصاريف ({expenses.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="suppliers">موردين ({sup.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="closings">تقفيلات ({closings.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="advances">سلف ({advances.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="transfers" className="space-y-3">
          {transfers.data?.length === 0 ? <Empty /> : null}
          {(transfers.data ?? []).map((t) => (
            <Card key={t.id} className="gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="num text-base font-extrabold">{EGP(t.amount)}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t.branches?.name} · {t.profiles?.full_name}
                {t.customer_ref ? ` · ${t.customer_ref}` : ""}
              </div>
              {t.notes ? <p className="text-xs">{t.notes}</p> : null}
              <ProofViewer path={t.proof_path} />
              <DecideRow kind="transfers" id={t.id} />
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="expenses" className="space-y-3">
          {expenses.data?.length === 0 ? <Empty /> : null}
          {(expenses.data ?? []).map((x) => (
            <Card key={x.id} className="gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="num text-base font-extrabold">{EGP(x.amount)}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(x.created_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {x.branches?.name} · {x.expense_categories?.name ?? "بند"} ·{" "}
                {x.payment_method === "cash" ? "كاش" : "تحويل"} · {x.profiles?.full_name}
              </div>
              <p className="text-xs">{x.description}</p>
              {x.proof_path ? <ProofViewer path={x.proof_path} label="عرض الإيصال" /> : null}
              <DecideRow kind="expenses" id={x.id} />
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-3">
          {sup.data?.length === 0 ? <Empty /> : null}
          {(sup.data ?? []).map((p) => (
            <Card key={p.id} className="gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="num text-base font-extrabold">{EGP(p.amount)}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(p.created_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {p.branches?.name} · {p.suppliers?.name} · {p.payment_method === "cash" ? "كاش" : "تحويل"} ·{" "}
                {p.profiles?.full_name}
              </div>
              {p.proof_path ? <ProofViewer path={p.proof_path} /> : null}
              <DecideRow kind="supplier_payments" id={p.id} />
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="closings" className="space-y-3">
          {closings.data?.length === 0 ? <Empty /> : null}
          {(closings.data ?? []).map((c) => (
            <Card key={c.id} className="gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">{c.branches?.name}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(c.closing_date)}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-muted-foreground">مبيعات كاش</span>
                <span className="num text-end font-semibold">{EGP(c.cash_sales)}</span>
                <span className="text-muted-foreground">مبيعات تحويلات</span>
                <span className="num text-end font-semibold">{EGP(c.transfer_sales)}</span>
                <span className="text-muted-foreground">مصاريف</span>
                <span className="num text-end font-semibold">{EGP(c.expenses_total)}</span>
                <span className="text-muted-foreground">موردين</span>
                <span className="num text-end font-semibold">{EGP(c.supplier_total)}</span>
                <span className="text-muted-foreground">المتوقع</span>
                <span className="num text-end font-semibold">{EGP(c.expected_cash)}</span>
                <span className="text-muted-foreground">الفعلي</span>
                <span className="num text-end font-semibold">{EGP(c.actual_cash)}</span>
                <span className="font-bold">الفرق</span>
                <span
                  className={`num text-end font-extrabold ${
                    Math.abs(Number(c.difference)) < 0.01
                      ? "text-success"
                      : Number(c.difference) > 0
                        ? "text-warning"
                        : "text-destructive"
                  }`}
                >
                  {EGP(c.difference)}
                </span>
              </div>
              {c.notes ? <p className="text-xs text-muted-foreground">ملاحظة الموظف: {c.notes}</p> : null}
              <DecideRow kind="daily_closings" id={c.id} />
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="advances" className="space-y-3">
          {advances.data?.length === 0 ? <Empty /> : null}
          {(advances.data ?? []).map((a) => (
            <Card key={a.id} className="gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="num text-base font-extrabold">{EGP(a.amount)}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {a.profiles?.full_name} · الراتب {EGP(a.profiles?.salary)}
              </div>
              <p className="text-xs">{a.reason}</p>
              <DecideRow kind="salary_advances" id={a.id} />
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
