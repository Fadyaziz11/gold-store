import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/queries";
import { getCurrentPosition, distanceMeters } from "@/lib/geo";
import { fmtDate, fmtTime, num } from "@/lib/fmt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapPin, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: branch } = useQuery({
    queryKey: ["my-branch", profile?.branch_id],
    enabled: !!profile?.branch_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .eq("id", profile!.branch_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records } = useQuery({
    queryKey: ["my-attendance", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", profile!.id)
        .order("check_in_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const open = (records ?? []).find((r) => !r.check_out_at) ?? null;

  async function verifiedPosition() {
    if (!branch) throw new Error("لم يتم تعيين فرع لحسابك");
    if (branch.latitude === null || branch.longitude === null)
      throw new Error("لم يتم تحديد إحداثيات الفرع. تواصل مع الإدارة.");
    const pos = await getCurrentPosition();
    const d = distanceMeters(pos.lat, pos.lng, Number(branch.latitude), Number(branch.longitude));
    const radius = Number(branch.radius_m ?? 150);
    if (d > radius)
      throw new Error(
        `أنت خارج نطاق الفرع (تبعد ${num(Math.round(d))} متر والمسموح ${num(radius)} متر). اقترب من الفرع وأعد المحاولة.`,
      );
    return pos;
  }

  const checkIn = useMutation({
    mutationFn: async () => {
      const pos = await verifiedPosition();
      const { error } = await supabase.from("attendance").insert({
        employee_id: profile!.id,
        branch_id: profile!.branch_id!,
        in_lat: pos.lat,
        in_lng: pos.lng,
        device: navigator.userAgent.slice(0, 180),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الحضور");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const checkOut = useMutation({
    mutationFn: async () => {
      const pos = await verifiedPosition();
      const { error } = await supabase
        .from("attendance")
        .update({ check_out_at: new Date().toISOString(), out_lat: pos.lat, out_lng: pos.lng })
        .eq("id", open!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الانصراف");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const pending = busy || checkIn.isPending || checkOut.isPending;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">الحضور والانصراف</h1>

      <Card className="gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4" />
          {branch ? `${branch.name} · نطاق ${num(branch.radius_m)} متر` : "لم يتم تعيين فرع"}
        </div>
        {open ? (
          <>
            <p className="text-sm">
              وردية مفتوحة منذ <span className="num font-bold">{fmtTime(open.check_in_at)}</span>
            </p>
            <Button
              className="w-full"
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                setBusy(true);
                await checkOut.mutateAsync().catch(() => {});
                setBusy(false);
              }}
            >
              <LogOut className="size-4" />
              {pending ? "جارٍ تحديد الموقع..." : "تسجيل الانصراف"}
            </Button>
          </>
        ) : (
          <Button
            className="w-full"
            disabled={pending || !branch}
            onClick={async () => {
              setBusy(true);
              await checkIn.mutateAsync().catch(() => {});
              setBusy(false);
            }}
          >
            <LogIn className="size-4" />
            {pending ? "جارٍ تحديد الموقع..." : "تسجيل الحضور"}
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">
          يتم التحقق من موقعك عبر GPS ولا يمكن التسجيل من خارج نطاق الفرع.
        </p>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">سجل الورديات</h2>
        {(records ?? []).map((r) => (
          <Card key={r.id} className="flex-row items-center justify-between gap-2 p-3">
            <span className="text-sm font-semibold">{fmtDate(r.check_in_at)}</span>
            <span className="num text-xs text-muted-foreground">
              {fmtTime(r.check_in_at)} → {r.check_out_at ? fmtTime(r.check_out_at) : "مفتوحة"}
            </span>
          </Card>
        ))}
        {records && records.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد سجل حضور بعد.</p>
        ) : null}
      </div>
    </div>
  );
}
