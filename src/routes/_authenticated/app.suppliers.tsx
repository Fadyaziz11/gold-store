import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg, useSuppliers } from "@/lib/queries";
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

export const Route = createFileRoute("/_authenticated/app/suppliers")({
  component: SuppliersPage,
});

function SuppliersPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: suppliers } = useSuppliers();
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: payments } = useQuery({
    queryKey: ["supplier-payments", profile?.branch_id],
    enabled: !!profile?.branch_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("*, suppliers(name)")
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
      if (!supplierId) throw new Error("اختر المورد");
      if (!Number.isFinite(v) || v <= 0) throw new Error("أدخل مبلغاً صحيحاً أكبر من صفر");
      if (method === "transfer" && !file) throw new Error("الدفع بالتحويل يتطلب إرفاق صورة الإثبات.");
      const path = file ? await uploadProof(file, profile.id, "suppliers") : null;
      const { error } = await supabase.from("supplier_payments").insert({
        branch_id: profile.branch_id,
        employee_id: profile.id,
        supplier_id: supplierId,
        amount: v,
        payment_method: method,
        notes: notes.trim() || null,
        proof_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل دفعة المورد");
      setAmount("");
      setNotes("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">مدفوعات الموردين</h1>

      <Card className="gap-4 p-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المورد" />
              </SelectTrigger>
              <SelectContent>
                {(suppliers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliers && suppliers.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">لا يوجد موردون. تضيفهم الإدارة من لوحة التحكم.</p>
            ) : null}
          </div>
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
            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof">
              صورة الإثبات {method === "transfer" ? "(إجباري)" : "(اختياري)"}
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
            {create.isPending ? "جارٍ الحفظ..." : "تسجيل الدفعة"}
          </Button>
        </form>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">آخر الدفعات</h2>
        {(payments ?? []).map((p) => (
          <Card key={p.id} className="gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="num text-sm font-bold">{EGP(p.amount)}</span>
              <StatusBadge status={p.status} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {p.suppliers?.name ?? "مورد"} · {p.payment_method === "cash" ? "كاش" : "تحويل"} ·{" "}
              {fmtDateTime(p.created_at)}
            </div>
            {p.proof_path ? <ProofViewer path={p.proof_path} /> : null}
          </Card>
        ))}
        {payments && payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد دفعات مسجلة.</p>
        ) : null}
      </div>
    </div>
  );
}
