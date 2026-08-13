import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useTreasuryBalance } from "@/lib/queries";
import { EGP, fmtDateTime } from "@/lib/fmt";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/treasury")({
  component: Treasury,
});

function Treasury() {
  const qc = useQueryClient();
  const { data: balance } = useTreasuryBalance();
  const [amount, setAmount] = useState("");
  const [dir, setDir] = useState<"in" | "out">("in");
  const [reason, setReason] = useState("");

  const { data: ledger } = useQuery({
    queryKey: ["ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*, branches(name)")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data;
    },
  });

  const manual = useMutation({
    mutationFn: async () => {
      const v = Number(amount);
      if (!Number.isFinite(v) || v <= 0) throw new Error("أدخل مبلغاً صحيحاً أكبر من صفر");
      if (!reason.trim()) throw new Error("اكتب سبب الحركة");
      const { error } = await supabase.rpc("treasury_manual", { _amount: v, _dir: dir, _reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل حركة الخزنة");
      setAmount("");
      setReason("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">الخزنة الرئيسية</h1>
      <StatCard label="الرصيد الحالي" value={EGP(balance)} tone="primary" icon={<Landmark className="size-4" />} />

      <Card className="gap-3 p-4">
        <h2 className="text-sm font-bold">حركة يدوية</h2>
        <form
          className="grid gap-3 md:grid-cols-4 md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            manual.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>النوع</Label>
            <Select value={dir} onValueChange={(v) => setDir(v as "in" | "out")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">إيداع للخزنة</SelectItem>
                <SelectItem value="out">سحب من الخزنة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>المبلغ</Label>
            <Input dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>السبب</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="submit" disabled={manual.isPending}>
            {manual.isPending ? "جارٍ التسجيل..." : "تسجيل الحركة"}
          </Button>
        </form>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">دفتر الحركات</h2>
        {(ledger ?? []).map((l) => (
          <Card key={l.id} className="flex-row items-center justify-between gap-2 p-3">
            <div>
              <p className="text-sm font-semibold">{l.txn_type}</p>
              <p className="text-[11px] text-muted-foreground">
                {l.branches?.name ?? "الخزنة"} · {fmtDateTime(l.created_at)}
                {l.notes ? ` · ${l.notes}` : ""}
              </p>
            </div>
            <span className={`num font-extrabold ${l.direction === "in" ? "text-success" : "text-destructive"}`}>
              {l.direction === "in" ? "+" : "-"} {EGP(l.amount)}
            </span>
          </Card>
        ))}
        {ledger && ledger.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة.</p>
        ) : null}
      </div>
    </div>
  );
}
