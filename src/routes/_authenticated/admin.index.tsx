import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranches, useTreasuryBalance } from "@/lib/queries";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EGP, cairoToday, fmtDate } from "@/lib/fmt";
import { Landmark, ShoppingBag, Receipt, AlertTriangle } from "lucide-react";
import type { DaySummary } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const today = cairoToday();
  const { data: branches } = useBranches();
  const { data: treasury } = useTreasuryBalance();

  const summaries = useQueries({
    queries: (branches ?? []).map((b) => ({
      queryKey: ["day-summary", b.id, today],
      queryFn: async (): Promise<DaySummary> => {
        const { data, error } = await supabase.rpc("branch_day_summary", { _branch: b.id, _date: today });
        if (error) throw error;
        return data as unknown as DaySummary;
      },
    })),
  });

  const { data: pending } = useQuery({
    queryKey: ["pending-counts"],
    queryFn: async () => {
      const [t, e, s, c, a] = await Promise.all([
        supabase.from("transfers").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("supplier_payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("daily_closings").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("salary_advances").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return {
        transfers: t.count ?? 0,
        expenses: e.count ?? 0,
        suppliers: s.count ?? 0,
        closings: c.count ?? 0,
        advances: a.count ?? 0,
      };
    },
  });

  const totals = summaries.reduce(
    (acc, q) => {
      const d = q.data;
      if (!d) return acc;
      return {
        sales: acc.sales + Number(d.total_sales ?? 0),
        cash: acc.cash + Number(d.cash_sales ?? 0),
        expenses: acc.expenses + Number(d.expenses_total ?? 0) + Number(d.supplier_total ?? 0),
      };
    },
    { sales: 0, cash: 0, expenses: 0 },
  );

  const pendingTotal = pending
    ? pending.transfers + pending.expenses + pending.suppliers + pending.closings + pending.advances
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">لوحة التحكم</h1>
        <p className="text-xs text-muted-foreground">{fmtDate(new Date())}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="رصيد الخزنة الرئيسية"
          value={EGP(treasury)}
          tone="primary"
          icon={<Landmark className="size-4" />}
        />
        <StatCard
          label="مبيعات اليوم (كل الفروع)"
          value={EGP(totals.sales)}
          tone="success"
          icon={<ShoppingBag className="size-4" />}
        />
        <StatCard
          label="مصروفات ومدفوعات اليوم"
          value={EGP(totals.expenses)}
          tone="destructive"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="عمليات بانتظار المراجعة"
          value={String(pendingTotal)}
          tone="warning"
          icon={<AlertTriangle className="size-4" />}
          hint={
            pending
              ? `تحويلات ${pending.transfers} · مصاريف ${pending.expenses} · موردين ${pending.suppliers} · تقفيلات ${pending.closings} · سلف ${pending.advances}`
              : undefined
          }
        />
      </div>

      <Button asChild size="sm">
        <Link to="/admin/approvals">فتح شاشة المراجعات</Link>
      </Button>

      <div>
        <h2 className="mb-2 text-sm font-bold">أداء الفروع اليوم</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(branches ?? []).map((b, i) => {
            const d = summaries[i]?.data;
            return (
              <Card key={b.id} className="gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{b.name}</span>
                  {!b.active ? <span className="text-[11px] text-destructive">موقوف</span> : null}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">مبيعات</span>
                  <span className="num font-bold text-success">{EGP(d?.total_sales)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">كاش</span>
                  <span className="num font-semibold">{EGP(d?.cash_sales)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">تحويلات</span>
                  <span className="num font-semibold">{EGP(d?.transfer_sales)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-sm">
                  <span className="text-muted-foreground">الكاش المتوقع</span>
                  <span className="num font-extrabold">{EGP(d?.expected_cash)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
