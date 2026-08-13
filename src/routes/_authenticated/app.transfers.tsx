import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg, methodLabel, TRANSFER_METHODS, useOpenShift } from "@/lib/queries";
import { EGP, fmtDateTime, shortId } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { ProofViewer, uploadProof } from "@/components/ProofViewer";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/transfers")({
  component: TransfersPage,
});

function TransfersPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: shift } = useOpenShift(profile?.id);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("instapay");
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: transfers } = useQuery({
    queryKey: ["my-transfers", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("*")
        .eq("employee_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!profile?.branch_id) throw new Error("لم يتم تعيين فرع لحسابك");
      if (!shift) throw new Error("لازم تفتح وردية داخل الفرع قبل تسجيل أي تحويل.");
      const v = Number(amount);
      if (!Number.isFinite(v) || v <= 0) throw new Error("أدخل مبلغاً صحيحاً أكبر من صفر");
      if (!file) throw new Error("يجب إرفاق صورة إثبات التحويل قبل إرسال العملية.");
      const path = await uploadProof(file, profile.id, "transfers");
      const { error } = await supabase.from("transfers").insert({
        branch_id: profile.branch_id,
        employee_id: profile.id,
        amount: v,
        method,
        customer_ref: customer.trim() || null,
        notes: notes.trim() || null,
        proof_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل التحويل");
      setAmount("");
      setCustomer("");
      setNotes("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const todayTotals = (transfers ?? [])
    .filter((t) => t.status !== "rejected")
    .reduce(
      (a, t) => {
        const v = Number(t.amount);
        if (t.method === "instapay") a.instapay += v;
        else if (t.method === "wallet") a.wallet += v;
        else a.other += v;
        return a;
      },
      { instapay: 0, wallet: 0, other: 0 },
    );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">التحويلات (إنستاباي / محفظة)</h1>

      {!shift ? (
        <Card className="border-warning bg-warning/10 p-3 text-xs font-semibold text-warning">
          لا توجد وردية مفتوحة — سجّل حضورك داخل الفرع أولاً حتى تقدر تسجّل تحويلات.
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "إنستاباي", v: todayTotals.instapay },
          { l: "محفظة", v: todayTotals.wallet },
          { l: "أخرى", v: todayTotals.other },
        ].map((x) => (
          <Card key={x.l} className="gap-1 p-3">
            <span className="text-[11px] text-muted-foreground">{x.l}</span>
            <span className="num text-sm font-extrabold">{EGP(x.v)}</span>
          </Card>
        ))}
      </div>

      <Card className="gap-4 p-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="amount">مبلغ التحويل (ج.م)</Label>
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
            <Label>طريقة التحصيل</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer">رقم مرجعي / بيانات العميل (اختياري)</Label>
            <Input id="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">وصف / ملاحظات</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof">صورة إثبات التحويل (إجباري)</Label>
            <Input
              id="proof"
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">
              {file ? `تم اختيار: ${file.name}` : "لا يمكن إرسال التحويل بدون صورة إثبات."}
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending || !profile?.branch_id || !shift}>
            <Upload className="size-4" />
            {create.isPending ? "جارٍ الإرسال..." : "تسجيل التحويل"}
          </Button>
        </form>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">سجل تحويلاتي</h2>
        {(transfers ?? []).map((t) => (
          <Card key={t.id} className="gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="num text-sm font-bold">{EGP(t.amount)}</span>
              <StatusBadge status={t.status} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {methodLabel(t.method)} · #{shortId(t.id)} · {fmtDateTime(t.created_at)}
              {t.customer_ref ? ` · ${t.customer_ref}` : ""}
            </div>
            {t.status === "rejected" && t.rejection_reason ? (
              <p className="text-xs text-destructive">سبب الرفض: {t.rejection_reason}</p>
            ) : null}
            <div>
              <ProofViewer path={t.proof_path} />
            </div>
          </Card>
        ))}
        {transfers && transfers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تحويلات مسجلة.</p>
        ) : null}
      </div>
    </div>
  );
}
