-- ============ 1. TRANSFERS: payment channel ============
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'instapay';
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_method_chk;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_method_chk CHECK (method IN ('instapay','wallet','other'));
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.attendance(id);

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.attendance(id);
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.attendance(id);

-- ============ 2. DAILY CLOSINGS: new derived columns ============
ALTER TABLE public.daily_closings
  ADD COLUMN IF NOT EXISTS instapay_sales numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_sales numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_transfer_sales numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_cash_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advances_branch numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sales numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ============ 3. PAYROLL extras ============
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS commissions numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;

-- ============ 4. TREASURY SETTLEMENTS ============
CREATE TABLE IF NOT EXISTS public.treasury_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_closings(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(14,2) NOT NULL,
  settlement_type text NOT NULL DEFAULT 'closing_cash',
  status text NOT NULL DEFAULT 'active',
  ledger_id uuid REFERENCES public.ledger_entries(id),
  reversal_ledger_id uuid REFERENCES public.ledger_entries(id),
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.treasury_settlements TO authenticated;
GRANT ALL ON public.treasury_settlements TO service_role;
ALTER TABLE public.treasury_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ts_admin ON public.treasury_settlements;
CREATE POLICY ts_admin ON public.treasury_settlements FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS ts_read ON public.treasury_settlements;
CREATE POLICY ts_read ON public.treasury_settlements FOR SELECT TO authenticated USING (public.is_admin() OR employee_id = auth.uid());
CREATE UNIQUE INDEX IF NOT EXISTS ts_active_closing_uidx ON public.treasury_settlements(closing_id) WHERE status = 'active';

-- ============ 5. EMPLOYEE-LEVEL ISOLATION (backend enforced) ============
DROP POLICY IF EXISTS sales_read ON public.sales;
CREATE POLICY sales_read ON public.sales FOR SELECT TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid());
DROP POLICY IF EXISTS transfers_read ON public.transfers;
CREATE POLICY transfers_read ON public.transfers FOR SELECT TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid());
DROP POLICY IF EXISTS expenses_read ON public.expenses;
CREATE POLICY expenses_read ON public.expenses FOR SELECT TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid());
DROP POLICY IF EXISTS sp_read ON public.supplier_payments;
CREATE POLICY sp_read ON public.supplier_payments FOR SELECT TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid());
DROP POLICY IF EXISTS closings_read ON public.daily_closings;
CREATE POLICY closings_read ON public.daily_closings FOR SELECT TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid());

-- ============ 6. SHIFT SUMMARY (transfers by channel, no cash sales) ============
CREATE OR REPLACE FUNCTION public.shift_summary(_att uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a record; ts timestamptz; te timestamptz;
        ip numeric; wl numeric; ot numeric; ex numeric; exn numeric; spc numeric; spt numeric; adv numeric;
BEGIN
  SELECT * INTO a FROM public.attendance WHERE id = _att;
  IF a IS NULL THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  IF NOT (public.is_admin() OR a.employee_id = auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  ts := a.check_in_at; te := COALESCE(a.check_out_at, now());

  SELECT COALESCE(SUM(amount),0) INTO ip FROM public.transfers
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND status<>'rejected' AND method='instapay' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO wl FROM public.transfers
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND status<>'rejected' AND method='wallet' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO ot FROM public.transfers
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND status<>'rejected' AND method='other' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO ex FROM public.expenses
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND status<>'rejected' AND payment_method='cash' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO exn FROM public.expenses
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND status<>'rejected' AND payment_method<>'cash' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO spc FROM public.supplier_payments
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND status<>'rejected' AND payment_method='cash' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO spt FROM public.supplier_payments
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND status<>'rejected' AND payment_method<>'cash' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO adv FROM public.salary_advances
    WHERE employee_id=a.employee_id AND branch_id=a.branch_id AND source='branch' AND status IN ('approved','paid') AND created_at BETWEEN ts AND te;

  RETURN jsonb_build_object(
    'instapay', ip, 'wallet', wl, 'other_transfers', ot,
    'transfers_total', ip + wl + ot,
    'expenses_cash', ex, 'expenses_non_cash', exn,
    'supplier_cash', spc, 'supplier_non_cash', spt,
    'advances_branch', adv,
    'shift_start', ts, 'shift_end', te);
END; $function$;

-- ============ 7. RECOMPUTE CLOSING (shared math) ============
CREATE OR REPLACE FUNCTION public.closing_compute(_att uuid, _branch uuid, _date date, _cash numeric, _actual numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s jsonb; tt numeric; ec numeric;
BEGIN
  IF _att IS NOT NULL THEN
    s := public.shift_summary(_att);
  ELSE
    s := jsonb_build_object('instapay',0,'wallet',0,'other_transfers',0,'transfers_total',0,
      'expenses_cash',0,'expenses_non_cash',0,'supplier_cash',0,'supplier_non_cash',0,'advances_branch',0);
  END IF;
  tt := (s->>'transfers_total')::numeric;
  ec := ROUND(COALESCE(_cash,0) - (s->>'expenses_cash')::numeric - (s->>'supplier_cash')::numeric - (s->>'advances_branch')::numeric, 2);
  RETURN s || jsonb_build_object(
    'cash_sales', ROUND(COALESCE(_cash,0),2),
    'total_sales', ROUND(COALESCE(_cash,0) + tt, 2),
    'expected_cash', ec,
    'difference', ROUND(COALESCE(_actual,0) - ec, 2),
    'net_total', ROUND(ec + tt, 2));
END; $function$;

-- ============ 8. CLOSING INSERT ============
CREATE OR REPLACE FUNCTION public.handle_closing_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s jsonb; a record;
BEGIN
  IF NEW.attendance_id IS NULL AND NOT public.is_admin() THEN
    SELECT * INTO a FROM public.attendance
      WHERE employee_id = NEW.employee_id AND branch_id = NEW.branch_id AND check_out_at IS NULL
      ORDER BY check_in_at DESC LIMIT 1;
    IF a IS NULL THEN RAISE EXCEPTION 'لا يمكن عمل تقفيلة بدون وردية مفتوحة.'; END IF;
    NEW.attendance_id := a.id;
  END IF;
  IF NEW.attendance_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.daily_closings WHERE attendance_id = NEW.attendance_id) THEN
    RAISE EXCEPTION 'تم عمل تقفيلة لهذه الوردية بالفعل.';
  END IF;

  s := public.closing_compute(NEW.attendance_id, NEW.branch_id, NEW.closing_date, NEW.cash_sales, NEW.actual_cash);
  NEW.shift_start := (s->>'shift_start')::timestamptz;
  NEW.shift_end := (s->>'shift_end')::timestamptz;
  NEW.cash_sales := (s->>'cash_sales')::numeric;
  NEW.instapay_sales := (s->>'instapay')::numeric;
  NEW.wallet_sales := (s->>'wallet')::numeric;
  NEW.other_transfer_sales := (s->>'other_transfers')::numeric;
  NEW.transfer_sales := (s->>'transfers_total')::numeric;
  NEW.transfer_total := (s->>'transfers_total')::numeric;
  NEW.expenses_total := (s->>'expenses_cash')::numeric;
  NEW.supplier_total := (s->>'supplier_cash')::numeric;
  NEW.supplier_cash_total := (s->>'supplier_cash')::numeric;
  NEW.advances_branch := (s->>'advances_branch')::numeric;
  NEW.total_sales := (s->>'total_sales')::numeric;
  NEW.expected_cash := (s->>'expected_cash')::numeric;
  NEW.difference := (s->>'difference')::numeric;
  NEW.net_total := (s->>'net_total')::numeric;
  NEW.status := 'pending';
  PERFORM public.notify_admins('تقفيلة جديدة بانتظار المراجعة','كاش فعلي '||NEW.actual_cash||' ج.م — فرق '||NEW.difference||' ج.م','/admin/approvals');
  RETURN NEW;
END; $function$;

-- ============ 9. SETTLEMENT HELPERS ============
CREATE OR REPLACE FUNCTION public.reverse_closing_settlement(_closing uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE st record; lid uuid;
BEGIN
  SELECT * INTO st FROM public.treasury_settlements WHERE closing_id = _closing AND status='active';
  IF st IS NULL THEN RETURN; END IF;
  INSERT INTO public.ledger_entries(txn_type, amount, direction, source, destination, branch_id, employee_id, related_table, related_id, notes, created_by, approved_by)
  VALUES ('settlement_reversal', st.amount, 'out', 'الخزنة الرئيسية', 'عكس تسوية تقفيلة', st.branch_id, st.employee_id, 'daily_closings', _closing, COALESCE(_reason,'عكس تسوية'), auth.uid(), auth.uid())
  RETURNING id INTO lid;
  UPDATE public.treasury_settlements SET status='reversed', reversal_ledger_id=lid, updated_at=now() WHERE id = st.id;
  PERFORM public.write_audit('settlement_reversed','treasury_settlements',st.id,to_jsonb(st),jsonb_build_object('reason',_reason));
END; $function$;

CREATE OR REPLACE FUNCTION public.create_closing_settlement(_closing uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c record; lid uuid; sid uuid;
BEGIN
  SELECT * INTO c FROM public.daily_closings WHERE id = _closing;
  IF c IS NULL OR c.status <> 'approved' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.treasury_settlements WHERE closing_id=_closing AND status='active') THEN RETURN; END IF;
  IF COALESCE(c.actual_cash,0) <= 0 THEN RETURN; END IF;
  INSERT INTO public.ledger_entries(txn_type, amount, direction, source, destination, branch_id, employee_id, related_table, related_id, notes, created_by, approved_by)
  VALUES ('closing_settlement', c.actual_cash, 'in', 'كاش الفرع', 'الخزنة الرئيسية', c.branch_id, c.employee_id, 'daily_closings', _closing, 'تسوية تقفيلة '||c.closing_date, auth.uid(), auth.uid())
  RETURNING id INTO lid;
  INSERT INTO public.treasury_settlements(closing_id, branch_id, employee_id, amount, ledger_id, approved_by)
  VALUES (_closing, c.branch_id, c.employee_id, c.actual_cash, lid, auth.uid()) RETURNING id INTO sid;
  PERFORM public.write_audit('settlement_created','treasury_settlements',sid,NULL,jsonb_build_object('amount',c.actual_cash,'closing',_closing));
END; $function$;

-- ============ 10. CLOSING UPDATE: admin full control ============
CREATE OR REPLACE FUNCTION public.handle_closing_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح بتعديل التقفيلة'; END IF;

  s := public.closing_compute(NEW.attendance_id, NEW.branch_id, NEW.closing_date, NEW.cash_sales, NEW.actual_cash);
  NEW.cash_sales := (s->>'cash_sales')::numeric;
  NEW.instapay_sales := (s->>'instapay')::numeric;
  NEW.wallet_sales := (s->>'wallet')::numeric;
  NEW.other_transfer_sales := (s->>'other_transfers')::numeric;
  NEW.transfer_sales := (s->>'transfers_total')::numeric;
  NEW.transfer_total := (s->>'transfers_total')::numeric;
  NEW.expenses_total := (s->>'expenses_cash')::numeric;
  NEW.supplier_total := (s->>'supplier_cash')::numeric;
  NEW.supplier_cash_total := (s->>'supplier_cash')::numeric;
  NEW.advances_branch := (s->>'advances_branch')::numeric;
  NEW.total_sales := (s->>'total_sales')::numeric;
  NEW.expected_cash := (s->>'expected_cash')::numeric;
  NEW.difference := (s->>'difference')::numeric;
  NEW.net_total := (s->>'net_total')::numeric;
  NEW.edited_by := auth.uid();
  NEW.edited_at := now();
  NEW.updated_at := now();

  IF NEW.status <> OLD.status THEN
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
    IF OLD.status = 'approved' THEN NEW.reopened_count := OLD.reopened_count + 1; END IF;
    PERFORM public.notify_user(NEW.employee_id,
      CASE NEW.status WHEN 'approved' THEN 'تم اعتماد تقفيلتك'
                      WHEN 'rejected' THEN 'تم رفض تقفيلتك'
                      WHEN 'correction' THEN 'مطلوب تصحيح التقفيلة'
                      ELSE 'تم إعادة فتح تقفيلتك' END,
      COALESCE(NEW.rejection_reason, NEW.admin_notes, ''), '/app/closing');
  END IF;

  -- Treasury settlement is created ONLY on admin approval
  IF NEW.status = 'approved' THEN
    IF OLD.status = 'approved' AND NEW.actual_cash IS DISTINCT FROM OLD.actual_cash THEN
      PERFORM public.reverse_closing_settlement(NEW.id, 'تعديل تقفيلة معتمدة');
    END IF;
  ELSIF OLD.status = 'approved' THEN
    PERFORM public.reverse_closing_settlement(NEW.id, 'إعادة فتح/رفض تقفيلة معتمدة');
  END IF;

  PERFORM public.write_audit('closing_'||NEW.status,'daily_closings',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.after_closing_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'approved' THEN PERFORM public.create_closing_settlement(NEW.id); END IF;
  RETURN NULL;
END; $function$;

DROP TRIGGER IF EXISTS trg_closing_after_upd ON public.daily_closings;
CREATE TRIGGER trg_closing_after_upd AFTER UPDATE ON public.daily_closings
FOR EACH ROW EXECUTE FUNCTION public.after_closing_update();

-- ============ 11. NO AUTO TREASURY POSTING ON OPERATION APPROVAL ============
CREATE OR REPLACE FUNCTION public.handle_expense_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','expenses',NEW.id,NULL,to_jsonb(NEW));
    PERFORM public.notify_admins('مصروف جديد بانتظار المراجعة', NEW.amount||' ج.م - '||COALESCE(NEW.description,''), '/admin/approvals');
    RETURN NEW;
  END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NEW.status<>OLD.status THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.notify_user(NEW.employee_id,
      CASE WHEN NEW.status='approved' THEN 'تم اعتماد المصروف' ELSE 'تم رفض المصروف' END,
      NEW.amount||' ج.م', '/app/expenses');
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'expenses',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.handle_transfer_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','transfers',NEW.id,NULL,to_jsonb(NEW));
    PERFORM public.notify_admins('تحويل جديد بانتظار المراجعة', NEW.amount||' ج.م', '/admin/approvals');
    RETURN NEW;
  END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NEW.status<>OLD.status THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.notify_user(NEW.employee_id,
      CASE WHEN NEW.status='approved' THEN 'تم اعتماد التحويل' ELSE 'تم رفض التحويل' END,
      NEW.amount||' ج.م', '/app/transfers');
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'transfers',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.handle_sp_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','supplier_payments',NEW.id,NULL,to_jsonb(NEW));
    PERFORM public.notify_admins('دفعة مورد جديدة بانتظار المراجعة', NEW.amount||' ج.م', '/admin/approvals');
    RETURN NEW;
  END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NEW.status<>OLD.status THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.notify_user(NEW.employee_id,
      CASE WHEN NEW.status='approved' THEN 'تم اعتماد دفعة المورد' ELSE 'تم رفض دفعة المورد' END,
      NEW.amount||' ج.م', '/app/suppliers');
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'supplier_payments',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $function$;

-- branch-sourced advances must NOT touch main treasury (they reduce branch cash in the closing)
CREATE OR REPLACE FUNCTION public.handle_advance_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF OLD.status='paid' AND NEW.status<>'paid' THEN RAISE EXCEPTION 'لا يمكن تعديل سلفة مدفوعة'; END IF;
  IF NEW.status IN ('approved','rejected','paid') AND OLD.status <> NEW.status THEN
    NEW.approved_by := auth.uid();
    PERFORM public.notify_user(NEW.employee_id,
      CASE NEW.status WHEN 'approved' THEN 'تمت الموافقة على السلفة' WHEN 'paid' THEN 'تم صرف السلفة' ELSE 'تم رفض السلفة' END,
      NEW.amount||' ج.م', '/app/advances');
  END IF;
  IF NEW.status='paid' AND OLD.status<>'paid' THEN
    NEW.paid_at := now();
    IF NEW.source <> 'branch' THEN
      PERFORM public.post_ledger('advance_out',NEW.amount,'out','الخزنة الرئيسية','سلفة موظف',NULL,NEW.employee_id,'salary_advances',NEW.id,NEW.reason,auth.uid());
    END IF;
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'salary_advances',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $function$;

-- ============ 12. TRANSFER/EXPENSE/SP: bind to open shift automatically ============
CREATE OR REPLACE FUNCTION public.require_open_shift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM public.attendance
    WHERE employee_id = NEW.employee_id AND branch_id = NEW.branch_id AND check_out_at IS NULL
    ORDER BY check_in_at DESC LIMIT 1;
  IF a IS NULL THEN
    IF public.is_admin() THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'لا يمكن تنفيذ العملية بدون وردية مفتوحة داخل الفرع. سجّل حضورك أولاً.';
  END IF;
  NEW.attendance_id := a.id;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.require_open_shift_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a record;
BEGIN
  IF NEW.proof_path IS NULL OR length(trim(NEW.proof_path)) = 0 THEN
    RAISE EXCEPTION 'صورة إثبات المصروف إجبارية.';
  END IF;
  SELECT * INTO a FROM public.attendance
    WHERE employee_id = NEW.employee_id AND branch_id = NEW.branch_id AND check_out_at IS NULL
    ORDER BY check_in_at DESC LIMIT 1;
  IF a IS NULL THEN
    IF public.is_admin() THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'لا يمكن تنفيذ العملية بدون وردية مفتوحة داخل الفرع. سجّل حضورك أولاً.';
  END IF;
  NEW.attendance_id := a.id;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_shift_transfers ON public.transfers;
CREATE TRIGGER trg_shift_transfers BEFORE INSERT ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.require_open_shift();

-- ============ 13. PAYROLL SUMMARY VIEW FUNCTION ============
CREATE OR REPLACE FUNCTION public.employee_salary_summary(_employee uuid, _period text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE base numeric; com numeric; bon numeric; ded numeric; adv numeric; paid numeric;
BEGIN
  IF NOT (public.is_admin() OR _employee = auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT salary INTO base FROM public.profiles WHERE id = _employee;
  base := COALESCE(base,0);
  SELECT COALESCE(SUM(amount),0) INTO com FROM public.employee_adjustments WHERE employee_id=_employee AND period=_period AND kind='commission';
  SELECT COALESCE(SUM(amount),0) INTO bon FROM public.employee_adjustments WHERE employee_id=_employee AND period=_period AND kind='bonus';
  SELECT COALESCE(SUM(amount),0) INTO ded FROM public.employee_adjustments WHERE employee_id=_employee AND period=_period AND kind IN ('deduction','penalty');
  SELECT COALESCE(SUM(amount),0) INTO adv FROM public.salary_advances
    WHERE employee_id=_employee AND status IN ('approved','paid') AND to_char(created_at AT TIME ZONE 'Africa/Cairo','YYYY-MM')=_period;
  SELECT COALESCE(SUM(paid_amount),0) INTO paid FROM public.payroll WHERE employee_id=_employee AND period=_period;
  RETURN jsonb_build_object(
    'base_salary',base,'commissions',com,'bonuses',bon,'deductions',ded,'advances',adv,
    'net_salary', ROUND(base+com+bon-ded-adv,2),
    'paid', paid,
    'remaining', ROUND(base+com+bon-ded-adv-paid,2));
END; $function$;

-- ============ 14. RESET includes settlements ============
CREATE OR REPLACE FUNCTION public.reset_all_data(_password text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _password IS DISTINCT FROM '1830' THEN RAISE EXCEPTION 'كلمة سر التصفير غير صحيحة'; END IF;
  DELETE FROM public.treasury_settlements;
  DELETE FROM public.daily_closings;
  DELETE FROM public.sales;
  DELETE FROM public.transfers;
  DELETE FROM public.expenses;
  DELETE FROM public.supplier_payments;
  DELETE FROM public.salary_advances;
  DELETE FROM public.payroll;
  DELETE FROM public.employee_adjustments;
  DELETE FROM public.attendance;
  DELETE FROM public.ledger_entries;
  DELETE FROM public.notifications;
  DELETE FROM public.audit_logs;
  INSERT INTO public.audit_logs(user_id, action, entity, new_value)
  VALUES (auth.uid(),'system_reset','system', jsonb_build_object('at', now()));
  RETURN 'تم تصفير النظام بالكامل';
END; $function$;

REVOKE EXECUTE ON FUNCTION public.closing_compute(uuid,uuid,date,numeric,numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_closing_settlement(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_closing_settlement(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.employee_salary_summary(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.shift_summary(uuid) FROM anon;