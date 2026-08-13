import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/fmt";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground border-warning/40",
  approved: "bg-success/15 text-success border-success/40",
  paid: "bg-success/15 text-success border-success/40",
  rejected: "bg-destructive/10 text-destructive border-destructive/40",
  correction: "bg-accent text-accent-foreground border-border",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", styles[status] ?? "", className)}>
      {statusLabel[status] ?? status}
    </Badge>
  );
}
