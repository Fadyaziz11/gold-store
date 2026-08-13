import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranches } from "@/lib/queries";
import { EGP, cairoToday, fmtDate } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: Reports,
});

function Reports() {
  const today = cairoToday();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const { data: branches } = useBranches();

  const { data: closings } = useQuery({
    queryKey: ["report-closings", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("*, branches(name)")
        .gte("closing_date", from)
        .lte("closing_date", to)
        .order("closing_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totals = (closings ?? []).reduce(
    (a, c) => ({
      sales: a.sales + Number(c.cash_sales) + Number(c.transfer_sales),
      expenses: a.expenses + Number(c.expenses_total) + Number(c.supplier_total),
      diff: a.diff + Number(c.difference),
    }),
    { sales: 0, expenses: 0, diff: 0 },
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">التقارير</h1>

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>من تاريخ</Label>
          <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>إلى تاريخ</Label>
          <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">إجمالي المبيعات</span>
          <span className="num text-lg font-extrabold text-success">{EGP(totals.sales)}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">إجمالي المصروفات والمدفوعات</span>
          <span className="num text-lg font-extrabold text-destructive">{EGP(totals.expenses)}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">صافي فروق الخزن</span>
          <span className="num text-lg font-extrabold">{EGP(totals.diff)}</span>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">التقفيلات ({closings?.length ?? 0})</h2>
        {(closings ?? []).map((c) => (
          <Card key={c.id} className="flex-row flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="text-sm font-semibold">{c.branches?.name}</p>
              <p className="text-[11px] text-muted-foreground">{fmtDate(c.closing_date)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="num text-xs">
                مبيعات {EGP(Number(c.cash_sales) + Number(c.transfer_sales))} · فرق {EGP(c.difference)}
              </span>
              <StatusBadge status={c.status} />
            </div>
          </Card>
        ))}
        {closings && closings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تقفيلات في هذه الفترة.</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">عدد الفروع: {branches?.length ?? 0}</p>
      </div>
    </div>
  );
}
