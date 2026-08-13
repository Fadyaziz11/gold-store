import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <Card className={cn("gap-0 p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div className={cn("num mt-2 text-xl font-extrabold", tones[tone])}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}
