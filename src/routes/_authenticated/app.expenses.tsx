import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg, useExpenseCategories } from "@/lib/queries";
import { EGP, fmtDateTime } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { ProofViewer, uploadProof } from "@/components/ProofViewer";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: cats } = useExpenseCategories();
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: expenses } = useQuery({
    queryKey: ["my-expenses", profile?.branch_id],
    enabled: !!profile?.branch_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, expense_categories(name)")
        .eq("branch_id", profile!.branch_id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!profile?.branch_id) throw new Error("لم يتم تعيين فرع لحسابك");
      const v = Number(amount);
      if (!Number.isFinite(v) || v <= 0) throw new Error("أدخل مبلغاً صحيحاً أكبر من صفر");
      if (!categoryId) throw new Error("اختر بند المصروف");
      if (!desc.trim()) throw new Error("اكتب وصفاً للمصروف");
      if (!file) throw new Error("صورة إثبات المصروف إجبارية — صوّر الإيصال قبل الحفظ.");
      const path = await uploadProof(file, profile.id, "expenses");
      const { error } = await supabase.from("expenses").insert({
        branch_id: profile.branch_id,
        employee_id: profile.id,
        category_id: categoryId,
        amount: v,
        payment_method: method,
        description: desc.trim(),
        proof_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل المصروف");
      setAmount("");
      setDesc("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">مصاريف الفرع</h1>

      <Card className="gap-4 p-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="amount">المبلغ (ج.م)</Label>
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
            <Label>بند المصروف</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر البند" />
              </SelectTrigger>
              <SelectContent>
                {(cats ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as "cash" | "transfer")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">كاش من الدرج</SelectItem>
                <SelectItem value="transfer">تحويل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">الوصف</Label>
            <Textarea id="desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof">
              صورة الإيصال (إجباري)
            </Label>
            <Input
              id="proof"
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending || !profile?.branch_id}>
            {create.isPending ? "جارٍ الحفظ..." : "تسجيل المصروف"}
          </Button>
        </form>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">آخر المصاريف</h2>
        {(expenses ?? []).map((x) => (
          <Card key={x.id} className="gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="num text-sm font-bold">{EGP(x.amount)}</span>
              <StatusBadge status={x.status} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {x.expense_categories?.name ?? "بند"} · {x.payment_method === "cash" ? "كاش" : "تحويل"} ·{" "}
              {fmtDateTime(x.created_at)}
            </div>
            <p className="text-xs">{x.description}</p>
            {x.proof_path ? <ProofViewer path={x.proof_path} label="عرض الإيصال" /> : null}
          </Card>
        ))}
        {expenses && expenses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مصاريف مسجلة.</p>
        ) : null}
      </div>
    </div>
  );
}
