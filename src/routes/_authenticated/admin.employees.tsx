import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useBranches, useEmployees } from "@/lib/queries";
import { EGP } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  component: EmployeesAdmin,
});

function EmployeesAdmin() {
  const { data: employees } = useEmployees();
  const { data: branches } = useBranches();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: async (p: {
      id: string;
      full_name: string;
      phone: string | null;
      branch_id: string | null;
      salary: number;
      active: boolean;
    }) => {
      const { id, ...patch } = p;
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الموظف");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">إدارة الموظفين</h1>
      <p className="text-xs text-muted-foreground">
        ينشئ الموظف حسابه من صفحة الدخول، ثم تقوم الإدارة هنا بتعيين الفرع والراتب وتفعيل الحساب.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {(employees ?? []).map((e) => (
          <EmployeeCard
            key={e.id}
            emp={e}
            branches={branches ?? []}
            onSave={(p) => save.mutate({ id: e.id, ...p })}
          />
        ))}
        {employees && employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد موظفون مسجلون بعد.</p>
        ) : null}
      </div>
    </div>
  );
}

type Emp = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  branch_id: string | null;
  salary: number;
  active: boolean;
};

function EmployeeCard({
  emp,
  branches,
  onSave,
}: {
  emp: Emp;
  branches: { id: string; name: string }[];
  onSave: (p: {
    full_name: string;
    phone: string | null;
    branch_id: string | null;
    salary: number;
    active: boolean;
  }) => void;
}) {
  const [fullName, setFullName] = useState(emp.full_name);
  const [phone, setPhone] = useState(emp.phone ?? "");
  const [branchId, setBranchId] = useState(emp.branch_id ?? "none");
  const [salary, setSalary] = useState(String(emp.salary));
  const [active, setActive] = useState(emp.active);

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold">{emp.full_name}</p>
          <p className="text-[11px] text-muted-foreground">{emp.email ?? "-"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{active ? "مفعّل" : "موقوف"}</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>الاسم</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>رقم الهاتف</Label>
        <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label>الفرع</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر الفرع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون فرع</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>الراتب الشهري</Label>
          <Input dir="ltr" value={salary} onChange={(e) => setSalary(e.target.value)} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">الراتب الحالي: {EGP(emp.salary)}</p>
      <Button
        size="sm"
        onClick={() =>
          onSave({
            full_name: fullName.trim(),
            phone: phone.trim() || null,
            branch_id: branchId === "none" ? null : branchId,
            salary: Number(salary) || 0,
            active,
          })
        }
      >
        <Save className="size-4" /> حفظ
      </Button>
    </Card>
  );
}
