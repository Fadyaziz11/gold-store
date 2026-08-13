import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useExpenseCategories, useSuppliers } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/suppliers")({
  component: SuppliersAdmin,
});

function SuppliersAdmin() {
  const qc = useQueryClient();
  const { data: suppliers } = useSuppliers();
  const { data: cats } = useExpenseCategories();
  const [sName, setSName] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [cName, setCName] = useState("");

  const addSupplier = useMutation({
    mutationFn: async () => {
      if (!sName.trim()) throw new Error("اكتب اسم المورد");
      const { error } = await supabase
        .from("suppliers")
        .insert({ name: sName.trim(), phone: sPhone.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة المورد");
      setSName("");
      setSPhone("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addCat = useMutation({
    mutationFn: async () => {
      if (!cName.trim()) throw new Error("اكتب اسم البند");
      const { error } = await supabase.from("expense_categories").insert({ name: cName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة البند");
      setCName("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-3 p-4">
        <h1 className="text-sm font-extrabold">الموردون</h1>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addSupplier.mutate();
          }}
        >
          <div className="min-w-32 flex-1 space-y-2">
            <Label>اسم المورد</Label>
            <Input value={sName} onChange={(e) => setSName(e.target.value)} />
          </div>
          <div className="min-w-28 flex-1 space-y-2">
            <Label>الهاتف</Label>
            <Input dir="ltr" value={sPhone} onChange={(e) => setSPhone(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={addSupplier.isPending}>
            <Plus className="size-4" /> إضافة
          </Button>
        </form>
        <div className="space-y-1">
          {(suppliers ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
              <span className="font-semibold">{s.name}</span>
              <span className="num text-xs text-muted-foreground">{s.phone ?? "-"}</span>
            </div>
          ))}
          {suppliers && suppliers.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">لا يوجد موردون.</p>
          ) : null}
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <h1 className="text-sm font-extrabold">بنود المصاريف</h1>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addCat.mutate();
          }}
        >
          <div className="flex-1 space-y-2">
            <Label>اسم البند</Label>
            <Input value={cName} onChange={(e) => setCName(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={addCat.isPending}>
            <Plus className="size-4" /> إضافة
          </Button>
        </form>
        <div className="space-y-1">
          {(cats ?? []).map((c) => (
            <div key={c.id} className="border-b py-2 text-sm font-semibold last:border-0">
              {c.name}
            </div>
          ))}
          {cats && cats.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">لا توجد بنود.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
