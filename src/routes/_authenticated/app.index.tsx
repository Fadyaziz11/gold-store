import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOpenShift, useShiftSummary } from "@/lib/queries";
import { StatCard } from "@/components/StatCard";
import { EGP, fmtDate, fmtDateTime } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowLeftRight, Receipt, Truck, ClipboardCheck, Clock, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: EmployeeHome,
});

function EmployeeHome() {
  const { profile } = useAuth();
  const { data: shift } = useOpenShift(profile?.id);
  const { data: s, isLoading } = useShiftSummary(shift?.id);

  const { data: closing } = useQuery({
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

  const transfers = Number(s?.transfers_total ?? 0);
  const expenses = Number(s?.expenses_cash ?? 0) + Number(s?.expenses_non_cash ?? 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">ورديتي الحالية</h1>
        <p className="text-xs text-muted-foreground">{fmtDate(new Date())}</p>
      </div>

      <Card className="gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4" /> حالة الوردية
          </span>
          <span
            className={`flex items-center gap-1.5 text-xs font-bold ${shift ? "text-success" : "text-destructive"}`}
          >
            <span className={`size-2 rounded-full ${shift ? "bg-success" : "bg-destructive"}`} />
            {shift ? "مفتوحة" : "مغلقة"}
          </span>
        </div>
        {shift ? (
          <p className="text-[11px] text-muted-foreground">بدأت: {fmtDateTime(shift.check_in_at)}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            سجّل حضورك داخل الفرع لتقدر تسجّل تحويلات ومصاريف وتعمل تقفيلة.
          </p>
        )}
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to="/app/attendance">{shift ? "إنهاء الوردية" : "بدء الوردية"}</Link>
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="إجمالي التحويلات"
          value={isLoading ? "..." : EGP(transfers)}
          tone="primary"
          icon={<ArrowLeftRight className="size-4" />}
          hint={s ? `إنستاباي ${EGP(s.instapay)} · محفظة ${EGP(s.wallet)}` : undefined}
        />
        <StatCard
          label="مصاريف الوردية"
          value={isLoading ? "..." : EGP(expenses)}
          tone="destructive"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="مدفوعات موردين"
          value={isLoading ? "..." : EGP(Number(s?.supplier_cash ?? 0) + Number(s?.supplier_non_cash ?? 0))}
          tone="destructive"
          icon={<Truck className="size-4" />}
        />
        <StatCard
          label="سلف من كاش الفرع"
          value={isLoading ? "..." : EGP(s?.advances_branch)}
          tone="warning"
          icon={<Wallet className="size-4" />}
        />
      </div>

      <Card className="gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck className="size-4" /> تقفيلة الوردية
          </span>
          {closing ? (
            <StatusBadge status={closing.status} />
          ) : (
            <span className="text-xs text-muted-foreground">لم تُرسل بعد</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          مبيعات الكاش بتتكتب مرة واحدة في التقفيلة في نهاية الوردية.
        </p>
        <Button asChild size="sm" className="w-full">
          <Link to="/app/closing">{closing ? "عرض التقفيلة" : "بدء التقفيلة"}</Link>
        </Button>
      </Card>
    </div>
  );
}
