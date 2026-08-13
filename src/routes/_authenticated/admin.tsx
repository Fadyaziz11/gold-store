import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth, signOutEverywhere } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  CheckCircle2,
  ClipboardCheck,
  Building2,
  Users,
  Landmark,
  Truck,
  Wallet,
  BarChart3,
  Smartphone,
  LogOut,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "لوحة التحكم", icon: LayoutDashboard, exact: true },
  { to: "/admin/approvals", label: "المراجعات", icon: CheckCircle2 },
  { to: "/admin/closings", label: "التقفيلات", icon: ClipboardCheck },
  { to: "/admin/branches", label: "الفروع", icon: Building2 },
  { to: "/admin/employees", label: "الموظفين", icon: Users },
  { to: "/admin/treasury", label: "الخزنة الرئيسية", icon: Landmark },
  { to: "/admin/suppliers", label: "الموردين والبنود", icon: Truck },
  { to: "/admin/payroll", label: "المرتبات والسلف", icon: Wallet },
  { to: "/admin/reports", label: "التقارير", icon: BarChart3 },
] as const;

function AdminLayout() {
  const { isAdmin, loading, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && profile && !isAdmin) navigate({ to: "/app", replace: true });
  }, [loading, profile, isAdmin, navigate]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Landmark className="size-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold">لوحة الإدارة</p>
              <p className="text-[11px] text-muted-foreground">{profile?.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/app">
                <Smartphone className="size-4" /> واجهة الفرع
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                await signOutEverywhere(qc);
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto border-t">
          <nav className="mx-auto flex max-w-6xl gap-1 px-2 py-2">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: "exact" in n }}
                activeProps={{ className: "bg-primary text-primary-foreground" }}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-accent"
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
