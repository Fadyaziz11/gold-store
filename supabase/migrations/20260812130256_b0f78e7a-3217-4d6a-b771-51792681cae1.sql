-- 1) SHIFT-BASED CLOSINGS
ALTER TABLE public.daily_closings DROP CONSTRAINT IF EXISTS daily_closings_branch_id_closing_date_key;
ALTER TABLE public.daily_closings ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.attendance(id) ON DELETE SET NULL;
ALTER TABLE public.daily_closings ADD COLUMN IF NOT EXISTS transfer_total numeric NOT NULL DEFAULT 0;
ALTER TABLE public.daily_closings ADD COLUMN IF NOT EXISTS shift_start timestamptz;
ALTER TABLE public.daily_closings ADD COLUMN IF NOT EXISTS shift_end timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS daily_closings_attendance_uidx ON public.daily_closings(attendance_id) WHERE attendance_id IS NOT NULL;

-- 2) ADVANCES SOURCE
DO $$ BEGIN
  CREATE TYPE public.advance_source AS ENUM ('treasury','branch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.salary_advances ADD COLUMN IF NOT EXISTS source public.advance_source NOT NULL DEFAULT 'treasury';
ALTER TABLE public.salary_advances ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- 3) EMPLOYEE ADJUSTMENTS (deductions / commissions)
CREATE TABLE IF NOT EXISTS public.employee_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deduction','commission')),
  amount numeric NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_adjustments TO authenticated;
GRANT ALL ON public.employee_adjustments TO service_role;
ALTER TABLE public.employee_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adj_admin ON public.employee_adjustments;
CREATE POLICY adj_admin ON public.employee_adjustments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS adj_read ON public.employee_adjustments;
CREATE POLICY adj_read ON public.employee_adjustments FOR SELECT TO authenticated USING (public.is_admin() OR employee_id = auth.uid());

-- 4) NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_read ON public.notifications;
CREATE POLICY notif_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_admins(_title text, _body text, _link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, title, body, link)
  SELECT ur.user_id, _title, _body, _link FROM public.user_roles ur WHERE ur.role = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.notify_user(_user uuid, _title text, _body text, _link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, title, body, link)
  SELECT _user, _title, _body, _link WHERE _user IS NOT NULL;
$$;

-- 5) REQUIRE OPEN SHIFT FOR BRANCH OPERATIONS
CREATE OR REPLACE FUNCTION public.require_open_shift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance a
    WHERE a.employee_id = NEW.employee_id AND a.branch_id = NEW.branch_id AND a.check_out_at IS NULL
  ) THEN
    RAISE EXCEPTION 'لا يمكن تنفيذ العملية بدون وردية مفتوحة داخل الفرع. سجّل حضورك أولاً.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_shift_sales ON public.sales;
CREATE TRIGGER trg_shift_sales BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.require_open_shift();
DROP TRIGGER IF EXISTS trg_shift_transfers ON public.transfers;
CREATE TRIGGER trg_shift_transfers BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.require_open_shift();
DROP TRIGGER IF EXISTS trg_shift_sp ON public.supplier_payments;
CREATE TRIGGER trg_shift_sp BEFORE INSERT ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.require_open_shift();

CREATE OR REPLACE FUNCTION public.require_open_shift_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.proof_path IS NULL OR length(trim(NEW.proof_path)) = 0 THEN
    RAISE EXCEPTION 'صورة إثبات المصروف إجبارية.';
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance a
    WHERE a.employee_id = NEW.employee_id AND a.branch_id = NEW.branch_id AND a.check_out_at IS NULL
  ) THEN
    RAISE EXCEPTION 'لا يمكن تنفيذ العملية بدون وردية مفتوحة داخل الفرع. سجّل حضورك أولاً.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_shift_expenses ON public.expenses;
CREATE TRIGGER trg_shift_expenses BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.require_open_shift_expense();

-- 6) SHIFT SUMMARY
CREATE OR REPLACE FUNCTION public.shift_summary(_att uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; ts timestamptz; te timestamptz;
        cs numeric; tsales numeric; trf numeric; ex numeric; sp numeric; oc numeric; adv numeric;
BEGIN
  SELECT * INTO a FROM public.attendance WHERE id = _att;
  IF a IS NULL THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  IF NOT (public.is_admin() OR a.employee_id = auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  ts := a.check_in_at; te := COALESCE(a.check_out_at, now());

  SELECT COALESCE(SUM(amount),0) INTO cs FROM public.sales
    WHERE branch_id=a.branch_id AND employee_id=a.employee_id AND payment_method='cash' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO tsales FROM public.sales
    WHERE branch_id=a.branch_id AND employee_id=a.employee_id AND payment_method='transfer' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO trf FROM public.transfers
    WHERE branch_id=a.branch_id AND employee_id=a.employee_id AND status<>'rejected' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO ex FROM public.expenses
    WHERE branch_id=a.branch_id AND employee_id=a.employee_id AND status<>'rejected' AND payment_method='cash' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO oc FROM public.expenses
    WHERE branch_id=a.branch_id AND employee_id=a.employee_id AND status<>'rejected' AND payment_method='transfer' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO sp FROM public.supplier_payments
    WHERE branch_id=a.branch_id AND employee_id=a.employee_id AND status<>'rejected' AND payment_method='cash' AND created_at BETWEEN ts AND te;
  SELECT COALESCE(SUM(amount),0) INTO adv FROM public.salary_advances
    WHERE employee_id=a.employee_id AND source='branch' AND branch_id=a.branch_id AND status IN ('approved','paid') AND created_at BETWEEN ts AND te;

  RETURN jsonb_build_object(
    'cash_sales',cs,'transfer_sales',tsales,'customer_transfers',trf,
    'transfers_total', tsales + trf,
    'expenses_total',ex,'supplier_total',sp,'non_cash_expenses',oc,'advances_branch',adv,
    'other_cash_out',0,
    'expected_cash', cs - ex - sp - adv,
    'total_sales', cs + tsales + trf,
    'shift_start', ts, 'shift_end', te);
END; $$;
REVOKE EXECUTE ON FUNCTION public.shift_summary(uuid) FROM anon;

-- 7) DAY SUMMARY: include branch advances
CREATE OR REPLACE FUNCTION public.branch_day_summary(_branch uuid, _date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cs numeric; ts numeric; trf numeric; ex numeric; sp numeric; oc numeric; adv numeric;
BEGIN
  IF NOT (public.is_admin() OR _branch = public.my_branch()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO cs FROM public.sales
    WHERE branch_id=_branch AND payment_method='cash' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO ts FROM public.sales
    WHERE branch_id=_branch AND payment_method='transfer' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO trf FROM public.transfers
    WHERE branch_id=_branch AND status<>'rejected' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO ex FROM public.expenses
    WHERE branch_id=_branch AND status<>'rejected' AND payment_method='cash' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO sp FROM public.supplier_payments
    WHERE branch_id=_branch AND status<>'rejected' AND payment_method='cash' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO oc FROM public.expenses
    WHERE branch_id=_branch AND status<>'rejected' AND payment_method='transfer' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO adv FROM public.salary_advances
    WHERE branch_id=_branch AND source='branch' AND status IN ('approved','paid') AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  RETURN jsonb_build_object(
    'cash_sales',cs,'transfer_sales',ts,'customer_transfers',trf,'transfers_total', ts + trf,
    'expenses_total',ex,'supplier_total',sp,
    'other_cash_out',0,'non_cash_expenses',oc,'advances_branch',adv,
    'expected_cash', cs - ex - sp - adv,
    'total_sales', cs + ts + trf);
END; $$;
REVOKE EXECUTE ON FUNCTION public.branch_day_summary(uuid, date) FROM anon;

-- 8) CLOSING TRIGGERS (shift aware)
CREATE OR REPLACE FUNCTION public.handle_closing_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; a record;
BEGIN
  IF NEW.attendance_id IS NULL AND NOT public.is_admin() THEN
    SELECT * INTO a FROM public.attendance
      WHERE employee_id = NEW.employee_id AND branch_id = NEW.branch_id AND check_out_at IS NULL
      ORDER BY check_in_at DESC LIMIT 1;
    IF a IS NULL THEN RAISE EXCEPTION 'لا يمكن عمل تقفيلة بدون وردية مفتوحة.'; END IF;
    NEW.attendance_id := a.id;
  END IF;

  IF NEW.attendance_id IS NOT NULL THEN
    s := public.shift_summary(NEW.attendance_id);
    NEW.shift_start := (s->>'shift_start')::timestamptz;
    NEW.shift_end := (s->>'shift_end')::timestamptz;
  ELSE
    s := public.branch_day_summary(NEW.branch_id, NEW.closing_date);
  END IF;

  NEW.cash_sales := (s->>'cash_sales')::numeric;
  NEW.transfer_sales := (s->>'transfer_sales')::numeric;
  NEW.transfer_total := (s->>'transfers_total')::numeric;
  NEW.expenses_total := (s->>'expenses_total')::numeric;
  NEW.supplier_total := (s->>'supplier_total')::numeric;
  NEW.expected_cash := (s->>'expected_cash')::numeric;
  NEW.difference := NEW.actual_cash - NEW.expected_cash;
  NEW.status := 'pending';
  PERFORM public.notify_admins('تقفيلة جديدة بانتظار المراجعة','تقفيلة وردية بمبلغ فعلي '||NEW.actual_cash||' ج.م','/admin/approvals');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_closing_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status='approved' THEN RAISE EXCEPTION 'التقفيلة معتمدة ولا يمكن تعديلها'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح بتعديل التقفيلة'; END IF;
  IF NEW.status <> OLD.status THEN
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
    PERFORM public.notify_user(NEW.employee_id,
      CASE WHEN NEW.status='approved' THEN 'تم اعتماد تقفيلتك' ELSE 'تم رفض تقفيلتك' END,
      COALESCE(NEW.rejection_reason,''), '/app/closing');
  END IF;
  IF NEW.status='approved' AND NEW.actual_cash > 0 THEN
    PERFORM public.post_ledger('closing_cash_in',NEW.actual_cash,'in','كاش الفرع','الخزنة الرئيسية',NEW.branch_id,NEW.employee_id,'daily_closings',NEW.id,'توريد كاش تقفيلة '||NEW.closing_date,auth.uid());
  END IF;
  PERFORM public.write_audit('closing_'||NEW.status,'daily_closings',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;

-- 9) NOTIFY ON NEW REQUESTS + STATUS CHANGES
CREATE OR REPLACE FUNCTION public.handle_expense_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','expenses',NEW.id,NULL,to_jsonb(NEW));
    PERFORM public.notify_admins('مصروف جديد بانتظار المراجعة', NEW.amount||' ج.م - '||COALESCE(NEW.description,''), '/admin/approvals');
    RETURN NEW;
  END IF;
  IF OLD.status='approved' AND NEW.status<>'approved' THEN RAISE EXCEPTION 'لا يمكن تعديل مصروف معتمد'; END IF;
  IF NEW.status<>OLD.status THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.notify_user(NEW.employee_id,
      CASE WHEN NEW.status='approved' THEN 'تم اعتماد المصروف' ELSE 'تم رفض المصروف' END,
      NEW.amount||' ج.م', '/app/expenses');
  END IF;
  IF NEW.status='approved' AND OLD.status<>'approved' THEN
    PERFORM public.post_ledger('expense_out',NEW.amount,'out','الخزنة الرئيسية','مصروفات الفرع',NEW.branch_id,NEW.employee_id,'expenses',NEW.id,NEW.description,auth.uid());
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'expenses',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_transfer_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','transfers',NEW.id,NULL,to_jsonb(NEW));
    PERFORM public.notify_admins('تحويل جديد بانتظار المراجعة', NEW.amount||' ج.م', '/admin/approvals');
    RETURN NEW;
  END IF;
  IF OLD.status='approved' AND NEW.status <> 'approved' THEN RAISE EXCEPTION 'لا يمكن تعديل عملية معتمدة'; END IF;
  IF NEW.status<>OLD.status THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.notify_user(NEW.employee_id,
      CASE WHEN NEW.status='approved' THEN 'تم اعتماد التحويل' ELSE 'تم رفض التحويل' END,
      NEW.amount||' ج.م', '/app/transfers');
  END IF;
  IF NEW.status='approved' AND OLD.status<>'approved' THEN
    PERFORM public.post_ledger('transfer_in',NEW.amount,'in','عميل - تحويل بنكي','الخزنة الرئيسية',NEW.branch_id,NEW.employee_id,'transfers',NEW.id,NEW.notes,auth.uid());
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'transfers',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_sp_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','supplier_payments',NEW.id,NULL,to_jsonb(NEW));
    PERFORM public.notify_admins('دفعة مورد جديدة بانتظار المراجعة', NEW.amount||' ج.م', '/admin/approvals');
    RETURN NEW;
  END IF;
  IF OLD.status='approved' AND NEW.status<>'approved' THEN RAISE EXCEPTION 'لا يمكن تعديل دفعة معتمدة'; END IF;
  IF NEW.status<>OLD.status THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.notify_user(NEW.employee_id,
      CASE WHEN NEW.status='approved' THEN 'تم اعتماد دفعة المورد' ELSE 'تم رفض دفعة المورد' END,
      NEW.amount||' ج.م', '/app/suppliers');
  END IF;
  IF NEW.status='approved' AND OLD.status<>'approved' THEN
    PERFORM public.post_ledger('supplier_out',NEW.amount,'out','الخزنة الرئيسية','مورد',NEW.branch_id,NEW.employee_id,'supplier_payments',NEW.id,NEW.notes,auth.uid());
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'supplier_payments',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.check_advance_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; used numeric; maxa numeric;
BEGIN
  SELECT salary, advance_pct, branch_id INTO p FROM public.profiles WHERE id = NEW.employee_id;
  IF p IS NULL THEN RAISE EXCEPTION 'الموظف غير موجود'; END IF;
  IF NEW.source = 'branch' AND NEW.branch_id IS NULL THEN NEW.branch_id := p.branch_id; END IF;
  IF NEW.source = 'branch' AND NEW.branch_id IS NULL THEN RAISE EXCEPTION 'لا يوجد فرع مرتبط بحسابك'; END IF;
  maxa := ROUND(p.salary * p.advance_pct / 100.0, 2);
  SELECT COALESCE(SUM(amount),0) INTO used FROM public.salary_advances
   WHERE employee_id = NEW.employee_id AND status IN ('approved','paid','pending')
     AND date_trunc('month', created_at) = date_trunc('month', now());
  IF used + NEW.amount > maxa THEN
    RAISE EXCEPTION 'المبلغ يتجاوز الحد المتاح للسلفة. المتاح: % جنيه', GREATEST(maxa - used,0);
  END IF;
  PERFORM public.write_audit('create','salary_advances',NEW.id,NULL,to_jsonb(NEW));
  PERFORM public.notify_admins('طلب سلفة جديد', NEW.amount||' ج.م - '||CASE WHEN NEW.source='branch' THEN 'من كاش الفرع' ELSE 'من الخزنة الرئيسية' END, '/admin/payroll');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_advance_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF NEW.source = 'branch' THEN
      PERFORM public.post_ledger('advance_branch_out',NEW.amount,'out','كاش الفرع','سلفة موظف',NEW.branch_id,NEW.employee_id,'salary_advances',NEW.id,COALESCE(NEW.reason,'سلفة من كاش الفرع'),auth.uid());
    ELSE
      PERFORM public.post_ledger('advance_out',NEW.amount,'out','الخزنة الرئيسية','سلفة موظف',NULL,NEW.employee_id,'salary_advances',NEW.id,NEW.reason,auth.uid());
    END IF;
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'salary_advances',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_payroll_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status='paid' AND NEW.status<>'paid' THEN RAISE EXCEPTION 'لا يمكن تعديل مرتب مدفوع'; END IF;
  IF NEW.status='paid' AND OLD.status<>'paid' THEN
    NEW.paid_at := now();
    PERFORM public.post_ledger('payroll_out',NEW.net_salary,'out','الخزنة الرئيسية','مرتب موظف',NULL,NEW.employee_id,'payroll',NEW.id,NEW.period,auth.uid());
    PERFORM public.notify_user(NEW.employee_id,'تم صرف مرتبك', NEW.period||' - صافي '||NEW.net_salary||' ج.م','/app/account');
  END IF;
  PERFORM public.write_audit('payroll_'||NEW.status,'payroll',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;

-- 10) ADMIN CASH IN/OUT
CREATE OR REPLACE FUNCTION public.supplier_receipt(_supplier uuid, _amount numeric, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid; sname text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'المبلغ غير صالح'; END IF;
  SELECT name INTO sname FROM public.suppliers WHERE id = _supplier;
  IF sname IS NULL THEN RAISE EXCEPTION 'المورد غير موجود'; END IF;
  INSERT INTO public.ledger_entries(txn_type, amount, direction, source, destination, notes, created_by, approved_by)
  VALUES ('supplier_in', _amount, 'in', 'مورد: '||sname, 'الخزنة الرئيسية', _notes, auth.uid(), auth.uid())
  RETURNING id INTO nid;
  PERFORM public.write_audit('supplier_receipt','ledger_entries',nid,NULL,jsonb_build_object('amount',_amount,'supplier',sname,'notes',_notes));
  RETURN nid;
END; $$;
REVOKE EXECUTE ON FUNCTION public.supplier_receipt(uuid, numeric, text) FROM anon;

CREATE OR REPLACE FUNCTION public.employee_payout(_employee uuid, _amount numeric, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid; ename text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'المبلغ غير صالح'; END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'السبب مطلوب'; END IF;
  SELECT full_name INTO ename FROM public.profiles WHERE id = _employee;
  IF ename IS NULL THEN RAISE EXCEPTION 'الموظف غير موجود'; END IF;
  INSERT INTO public.ledger_entries(txn_type, amount, direction, source, destination, employee_id, notes, created_by, approved_by)
  VALUES ('employee_out', _amount, 'out', 'الخزنة الرئيسية', 'موظف: '||ename, _employee, _reason, auth.uid(), auth.uid())
  RETURNING id INTO nid;
  PERFORM public.notify_user(_employee,'تم صرف مبلغ لك من الخزنة', _amount||' ج.م - '||_reason, '/app/account');
  PERFORM public.write_audit('employee_payout','ledger_entries',nid,NULL,jsonb_build_object('amount',_amount,'employee',ename,'reason',_reason));
  RETURN nid;
END; $$;
REVOKE EXECUTE ON FUNCTION public.employee_payout(uuid, numeric, text) FROM anon;

-- 11) FULL RESET
CREATE OR REPLACE FUNCTION public.reset_all_data(_password text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _password IS DISTINCT FROM '1830' THEN RAISE EXCEPTION 'كلمة سر التصفير غير صحيحة'; END IF;
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
END; $$;
REVOKE EXECUTE ON FUNCTION public.reset_all_data(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid,text,text,text) FROM anon, authenticated;