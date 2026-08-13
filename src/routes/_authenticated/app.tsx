import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth, signOutEverywhere } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Home,
  
  ArrowLeftRight,
  Receipt,
  Truck,
  ClipboardCheck,
  Wallet,
  Clock,
  User,
  Menu,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: EmployeeLayout,
});

const items = [
  { to: "/app", label: "الرئيسية", icon: Home, exact: true },
  { to: "/app/transfers", label: "التحويلات", icon: ArrowLeftRight },
  { to: "/app/expenses", label: "المصاريف", icon: Receipt },
  { to: "/app/suppliers", label: "الموردين", icon: Truck },
  { to: "/app/closing", label: "التقفيلة اليومية", icon: ClipboardCheck },
  { to: "/app/advances", label: "السلف من المرتب", icon: Wallet },
  { to: "/app/attendance", label: "الحضور والانصراف", icon: Clock },
  { to: "/app/account", label: "حسابي", icon: User },
] as const;

const bottom = [items[0], items[1], items[2], items[4]];

function EmployeeLayout() {
  const { profile, branchName, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && profile && !profile.active) {
      void signOutEverywhere(qc).then(() => navigate({ to: "/auth", replace: true }));
    }
  }, [loading, profile, qc, navigate]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{profile?.full_name || "موظف"}</p>
            <p className="truncate text-xs text-muted-foreground">
              فرعك: <span className="font-semibold text-primary">{branchName ?? "لم يتم تعيين فرع"}</span>
            </p>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="القائمة">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>القائمة</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {items.map((it) => (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                    activeOptions={{ exact: "exact" in it }}
                    activeProps={{ className: "bg-accent text-accent-foreground" }}
                  >
                    <it.icon className="size-4" />
                    {it.label}
                  </Link>
                ))}
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                  >
                    <User className="size-4" />
                    لوحة الإدارة
                  </Link>
                )}
                <Button
                  variant="ghost"
                  className="mt-2 justify-start text-destructive"
                  onClick={async () => {
                    await signOutEverywhere(qc);
                    navigate({ to: "/auth", replace: true });
                  }}
                >
                  <LogOut className="size-4" /> تسجيل الخروج
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {!profile?.branch_id && !isAdmin ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            لم يتم تعيين فرع لحسابك بعد. تواصل مع الإدارة لتعيين الفرع قبل تسجيل أي عملية.
          </div>
        ) : null}
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {bottom.map((it) => {
            const active = it.to === "/app" ? pathname === "/app" : pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <it.icon className="size-5" />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
