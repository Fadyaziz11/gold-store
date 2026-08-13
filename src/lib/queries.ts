import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cairoToday } from "@/lib/fmt";

export type DaySummary = {
  cash_sales: number;
  transfer_sales: number;
  expenses_total: number;
  supplier_total: number;
  other_cash_out: number;
  non_cash_expenses: number;
  expected_cash: number;
  total_sales: number;
};

export type ShiftSummary = {
  instapay: number;
  wallet: number;
  other_transfers: number;
  transfers_total: number;
  expenses_cash: number;
  expenses_non_cash: number;
  supplier_cash: number;
  supplier_non_cash: number;
  advances_branch: number;
  shift_start: string;
  shift_end: string;
};

export const TRANSFER_METHODS = [
  { value: "instapay", label: "إنستاباي" },
  { value: "wallet", label: "محفظة إلكترونية" },
  { value: "other", label: "تحويل آخر" },
] as const;

export const methodLabel = (m: string | null | undefined) =>
  TRANSFER_METHODS.find((x) => x.value === m)?.label ?? "تحويل";

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

/** Currently open shift (attendance row) for the signed-in employee. */
export function useOpenShift(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ["open-shift", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", employeeId!)
        .is("check_out_at", null)
        .order("check_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Server-computed totals for one shift (transfers by channel, expenses, supplier payments). */
export function useShiftSummary(attendanceId: string | null | undefined) {
  return useQuery({
    queryKey: ["shift-summary", attendanceId],
    enabled: !!attendanceId,
    queryFn: async (): Promise<ShiftSummary> => {
      const { data, error } = await supabase.rpc("shift_summary", { _att: attendanceId! });
      if (error) throw error;
      return data as unknown as ShiftSummary;
    },
  });
}

export function useDaySummary(branchId: string | null | undefined, date = cairoToday()) {
  return useQuery({
    queryKey: ["day-summary", branchId, date],
    enabled: !!branchId,
    queryFn: async (): Promise<DaySummary> => {
      const { data, error } = await supabase.rpc("branch_day_summary", {
        _branch: branchId!,
        _date: date,
      });
      if (error) throw error;
      return data as unknown as DaySummary;
    },
  });
}

export function useTreasuryBalance() {
  return useQuery({
    queryKey: ["treasury-balance"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("treasury_balance");
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, branches(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: string }).message);
    if (m.includes("row-level security") || m.includes("violates row-level"))
      return "غير مصرح لك بتنفيذ هذه العملية على هذا الفرع.";
    if (m.includes("duplicate key") && m.includes("daily_closings"))
      return "تم إرسال تقفيلة لهذه الوردية بالفعل.";
    if (m.includes("duplicate key")) return "هذا السجل موجود بالفعل.";
    return m;
  }
  return "حدث خطأ غير متوقع";
}
