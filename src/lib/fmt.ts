export const EGP = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return (
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) +
    " ج.م"
  );
};

export const num = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(dt);
};

export const fmtTime = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(dt);
};

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  return `${fmtDate(d)} - ${fmtTime(d)}`;
};

/** Today's date in Africa/Cairo as YYYY-MM-DD (matches the database day boundary). */
export const cairoToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
};

export const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export const statusLabel: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  paid: "مدفوع",
  correction: "مطلوب تصحيح",
};
