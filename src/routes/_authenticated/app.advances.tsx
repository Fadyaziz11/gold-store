import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/queries";
import { EGP, fmtDate } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/advances")({
  component: AdvancesPage,
});

function AdvancesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<"treasury" | "branch">("treasury");

  const { data: advances } = useQuery({
    queryKey: ["my-advances", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_advances")
        .select("*")
        .eq("employee_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const month = new Date().toISOString().slice(0, 7);
  const usedThisMonth = (advances ?? [])
    .filter((a) => a.status !== "rejected" && String(a.created_at).slice(0, 7) === month)
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const salary = Number(profile?.salary ?? 0);
  const limit = salary * 0.5;
  const remaining = Math.max(limit - usedThisMonth, 0);

  const create = useMutation({
    mutationFn: async () => {
      const v = Number(amount);
      if (!Number.isFinite(v) || v <= 0) throw new Error("أدخل مبلغاً صحيحاً أكبر من صفر");
      if (salary <= 0) throw new Error("لم يتم تحديد راتبك بعد. تواصل مع الإدارة.");
      if (v > remaining)
        throw new Error(`الحد المتاح للسلف هذا الشهر ${EGP(remaining)} فقط (٥٠٪ من الراتب).`);
      if (!reason.trim()) throw new Error("اكتب سبب طلب السلفة");
      const { error } = await supabase.from("salary_advances").insert({
        employee_id: profile!.id,
        amount: v,
        reason: reason.trim(),
        source,
        branch_id: source === "branch" ? profile!.branch_id : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال طلب السلفة");
      setAmount("");
      setReason("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">السلف من المرتب</h1>

      <Card className="gap-0 p-4">
        <div className="flex items-center justify-between border-b py-2">
          <span className="text-sm text-muted-foreground">راتبك الشهري</span>
          <span className="num text-sm font-bold">{EGP(salary)}</span>
        </div>
        <div className="flex items-center justify-between border-b py-2">
          <span className="text-sm text-muted-foreground">سلف هذا الشهر</span>
          <span className="num text-sm font-bold">{EGP(usedThisMonth)}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-bold">المتاح للسلفة (٥٠٪)</span>
          <span className="num text-base font-extrabold text-primary">{EGP(remaining)}</span>
        </div>
      </Card>

      <Card className="gap-4 p-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="amount">مبلغ السلفة (ج.م)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label>مصدر صرف السلفة</Label>
            <Select value={source} onValueChange={(v) => setSource(v as "treasury" | "branch")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="treasury">الخزنة الرئيسية</SelectItem>
                <SelectItem value="branch">كاش الفرع</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              لو اخترت كاش الفرع، المبلغ هيتخصم من الكاش المتوقع في تقفيلة الفرع بعد الموافقة.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">سبب الطلب</Label>
            <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "جارٍ الإرسال..." : "طلب سلفة"}
          </Button>
        </form>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">طلباتي</h2>
        {(advances ?? []).map((a) => (
          <Card key={a.id} className="gap-1 p-3">
            <div className="flex items-center justify-between">
              <span className="num text-sm font-bold">{EGP(a.amount)}</span>
              <StatusBadge status={a.status} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {fmtDate(a.created_at)} · {a.source === "branch" ? "من كاش الفرع" : "من الخزنة الرئيسية"}
            </div>
            <p className="text-xs">{a.reason}</p>
          </Card>
        ))}
        {advances && advances.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد طلبات سلف.</p>
        ) : null}
      </div>
    </div>
  );
}
