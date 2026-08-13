import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useBranches } from "@/lib/queries";
import { num } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MapPin, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/branches")({
  component: BranchesAdmin,
});

function BranchesAdmin() {
  const { data: branches } = useBranches();
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: BranchPatch }) => {
      const { error } = await supabase.from("branches").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الفرع");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">إدارة الفروع</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {(branches ?? []).map((b) => (
          <BranchCard key={b.id} branch={b} onSave={(patch) => update.mutate({ id: b.id, patch })} />
        ))}
      </div>
    </div>
  );
}

type BranchPatch = {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  active: boolean;
};

type Branch = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  active: boolean;
};

function BranchCard({ branch, onSave }: { branch: Branch; onSave: (p: BranchPatch) => void }) {
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address ?? "");
  const [lat, setLat] = useState(branch.latitude?.toString() ?? "");
  const [lng, setLng] = useState(branch.longitude?.toString() ?? "");
  const [radius, setRadius] = useState(String(branch.radius_m));
  const [active, setActive] = useState(branch.active);

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="font-bold">{branch.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{active ? "نشط" : "موقوف"}</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>اسم الفرع</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>العنوان</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-2">
          <Label>خط العرض</Label>
          <Input dir="ltr" value={lat} onChange={(e) => setLat(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>خط الطول</Label>
          <Input dir="ltr" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>النطاق (م)</Label>
          <Input dir="ltr" value={radius} onChange={(e) => setRadius(e.target.value)} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        النطاق الحالي {num(branch.radius_m)} متر — يُستخدم للتحقق من حضور الموظفين.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              name: name.trim(),
              address: address.trim() || null,
              latitude: lat === "" ? null : Number(lat),
              longitude: lng === "" ? null : Number(lng),
              radius_m: Number(radius) || 150,
              active,
            })
          }
        >
          <Save className="size-4" /> حفظ
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.geolocation.getCurrentPosition(
              (p) => {
                setLat(p.coords.latitude.toFixed(6));
                setLng(p.coords.longitude.toFixed(6));
                toast.success("تم أخذ إحداثيات موقعك الحالي");
              },
              () => toast.error("تعذر تحديد الموقع الحالي"),
              { enableHighAccuracy: true },
            );
          }}
        >
          <MapPin className="size-4" /> استخدام موقعي
        </Button>
      </div>
    </Card>
  );
}
