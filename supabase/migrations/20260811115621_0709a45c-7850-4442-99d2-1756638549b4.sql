
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','employee');
CREATE TYPE public.pay_method AS ENUM ('cash','transfer');
CREATE TYPE public.txn_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.closing_status AS ENUM ('pending','approved','rejected','correction');
CREATE TYPE public.advance_status AS ENUM ('pending','approved','rejected','paid');
CREATE TYPE public.payroll_status AS ENUM ('pending','paid');
CREATE TYPE public.ledger_dir AS ENUM ('in','out');

-- ============ CORE ============
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  radius_m integer NOT NULL DEFAULT 200,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  email text,
  branch_id uuid REFERENCES public.branches(id),
  salary numeric(14,2) NOT NULL DEFAULT 0,
  advance_pct numeric(5,2) NOT NULL DEFAULT 50,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.my_branch()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.gps_distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)
  ));
$$;

-- ============ AUDIT ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.write_audit(_action text, _entity text, _entity_id uuid, _old jsonb, _new jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_logs(user_id, action, entity, entity_id, old_value, new_value)
  VALUES (auth.uid(), _action, _entity, _entity_id, _old, _new);
$$;

-- ============ LEDGER ============
CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_type text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  direction public.ledger_dir NOT NULL,
  source text,
  destination text,
  branch_id uuid REFERENCES public.branches(id),
  employee_id uuid REFERENCES public.profiles(id),
  related_table text,
  related_id uuid,
  notes text,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ledger_related_unique ON public.ledger_entries(related_table, related_id, txn_type)
  WHERE related_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.post_ledger(
  _type text, _amount numeric, _dir public.ledger_dir, _source text, _dest text,
  _branch uuid, _employee uuid, _table text, _rel uuid, _notes text, _approver uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ledger_entries(txn_type, amount, direction, source, destination, branch_id, employee_id, related_table, related_id, notes, created_by, approved_by)
  VALUES (_type, _amount, _dir, _source, _dest, _branch, _employee, _table, _rel, _notes, auth.uid(), _approver)
  ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.treasury_balance()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)::numeric
  FROM public.ledger_entries;
$$;

-- ============ OPERATIONS ============
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method public.pay_method NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  customer_ref text,
  notes text,
  proof_path text NOT NULL,
  status public.txn_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfers_proof_required CHECK (length(trim(proof_path)) > 0)
);

CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  category_id uuid REFERENCES public.expense_categories(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  description text,
  payment_method public.pay_method NOT NULL DEFAULT 'cash',
  proof_path text,
  status public.txn_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method public.pay_method NOT NULL DEFAULT 'cash',
  proof_path text,
  notes text,
  status public.txn_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  closing_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Cairo')::date,
  cash_sales numeric(14,2) NOT NULL DEFAULT 0,
  transfer_sales numeric(14,2) NOT NULL DEFAULT 0,
  expenses_total numeric(14,2) NOT NULL DEFAULT 0,
  supplier_total numeric(14,2) NOT NULL DEFAULT 0,
  other_cash_out numeric(14,2) NOT NULL DEFAULT 0,
  expected_cash numeric(14,2) NOT NULL DEFAULT 0,
  actual_cash numeric(14,2) NOT NULL,
  difference numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  status public.closing_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, closing_date)
);

CREATE TABLE public.salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text,
  status public.advance_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  approved_by uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  period text NOT NULL,
  base_salary numeric(14,2) NOT NULL DEFAULT 0,
  advances numeric(14,2) NOT NULL DEFAULT 0,
  deductions numeric(14,2) NOT NULL DEFAULT 0,
  bonuses numeric(14,2) NOT NULL DEFAULT 0,
  net_salary numeric(14,2) NOT NULL DEFAULT 0,
  status public.payroll_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period)
);

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  check_in_at timestamptz NOT NULL DEFAULT now(),
  in_lat double precision NOT NULL,
  in_lng double precision NOT NULL,
  check_out_at timestamptz,
  out_lat double precision,
  out_lng double precision,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies, public.branches, public.profiles, public.user_roles,
  public.sales, public.transfers, public.expenses, public.expense_categories, public.suppliers,
  public.supplier_payments, public.daily_closings, public.salary_advances, public.payroll,
  public.attendance, public.audit_logs, public.ledger_entries, public.settings TO authenticated;
GRANT ALL ON public.companies, public.branches, public.profiles, public.user_roles,
  public.sales, public.transfers, public.expenses, public.expense_categories, public.suppliers,
  public.supplier_payments, public.daily_closings, public.salary_advances, public.payroll,
  public.attendance, public.audit_logs, public.ledger_entries, public.settings TO service_role;

-- ============ RLS ============
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_read ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY companies_admin ON public.companies FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY branches_read ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY branches_admin ON public.branches FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY profiles_admin_write ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY roles_admin ON public.user_roles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY sales_read ON public.sales FOR SELECT TO authenticated USING (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (employee_id = auth.uid() AND branch_id = public.my_branch()));
CREATE POLICY sales_admin ON public.sales FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY transfers_read ON public.transfers FOR SELECT TO authenticated USING (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY transfers_insert ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (employee_id = auth.uid() AND branch_id = public.my_branch() AND status = 'pending'));
CREATE POLICY transfers_admin ON public.transfers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY expcat_read ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY expcat_admin ON public.expense_categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY expenses_read ON public.expenses FOR SELECT TO authenticated USING (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (employee_id = auth.uid() AND branch_id = public.my_branch() AND status = 'pending'));
CREATE POLICY expenses_admin ON public.expenses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY suppliers_read ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_admin ON public.suppliers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY sp_read ON public.supplier_payments FOR SELECT TO authenticated USING (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY sp_insert ON public.supplier_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (employee_id = auth.uid() AND branch_id = public.my_branch() AND status = 'pending'));
CREATE POLICY sp_admin ON public.supplier_payments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY closings_read ON public.daily_closings FOR SELECT TO authenticated USING (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY closings_insert ON public.daily_closings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (employee_id = auth.uid() AND branch_id = public.my_branch() AND status = 'pending'));
CREATE POLICY closings_admin ON public.daily_closings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY adv_read ON public.salary_advances FOR SELECT TO authenticated USING (public.is_admin() OR employee_id = auth.uid());
CREATE POLICY adv_insert ON public.salary_advances FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (employee_id = auth.uid() AND status = 'pending'));
CREATE POLICY adv_admin ON public.salary_advances FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY payroll_read ON public.payroll FOR SELECT TO authenticated USING (public.is_admin() OR employee_id = auth.uid());
CREATE POLICY payroll_admin ON public.payroll FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY att_read ON public.attendance FOR SELECT TO authenticated USING (public.is_admin() OR employee_id = auth.uid());
CREATE POLICY att_insert ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() AND branch_id = public.my_branch());
CREATE POLICY att_update_own ON public.attendance FOR UPDATE TO authenticated
  USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());
CREATE POLICY att_admin ON public.attendance FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY audit_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY ledger_read ON public.ledger_entries FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY ledger_admin ON public.ledger_entries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY settings_read ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_admin ON public.settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ TRIGGERS: business rules ============

-- new auth user -> profile; first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_exists boolean;
BEGIN
  INSERT INTO public.profiles(id, full_name, email, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role='admin') INTO admin_exists;
  IF NOT admin_exists THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id,'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id,'employee') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- branch change audit
CREATE OR REPLACE FUNCTION public.audit_profile_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    INSERT INTO public.audit_logs(user_id, action, entity, entity_id, old_value, new_value)
    VALUES (auth.uid(),'branch_change','profiles',NEW.id,
      jsonb_build_object('branch_id',OLD.branch_id), jsonb_build_object('branch_id',NEW.branch_id));
  END IF;
  IF NEW.salary IS DISTINCT FROM OLD.salary OR NEW.advance_pct IS DISTINCT FROM OLD.advance_pct OR NEW.active IS DISTINCT FROM OLD.active THEN
    INSERT INTO public.audit_logs(user_id, action, entity, entity_id, old_value, new_value)
    VALUES (auth.uid(),'employee_update','profiles',NEW.id,
      jsonb_build_object('salary',OLD.salary,'advance_pct',OLD.advance_pct,'active',OLD.active),
      jsonb_build_object('salary',NEW.salary,'advance_pct',NEW.advance_pct,'active',NEW.active));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_profile AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_change();

-- generic transaction audit + ledger posting on approval
CREATE OR REPLACE FUNCTION public.handle_transfer_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','transfers',NEW.id,NULL,to_jsonb(NEW));
    RETURN NEW;
  END IF;
  IF OLD.status='approved' AND NEW.status <> 'approved' THEN
    RAISE EXCEPTION 'لا يمكن تعديل عملية معتمدة';
  END IF;
  IF NEW.status='approved' AND OLD.status<>'approved' THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.post_ledger('transfer_in',NEW.amount,'in','عميل - تحويل بنكي','الخزنة الرئيسية',NEW.branch_id,NEW.employee_id,'transfers',NEW.id,NEW.notes,auth.uid());
  END IF;
  IF NEW.status='rejected' AND OLD.status<>'rejected' THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'transfers',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_transfer_ins AFTER INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.handle_transfer_change();
CREATE TRIGGER trg_transfer_upd BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.handle_transfer_change();

CREATE OR REPLACE FUNCTION public.handle_expense_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','expenses',NEW.id,NULL,to_jsonb(NEW));
    RETURN NEW;
  END IF;
  IF OLD.status='approved' AND NEW.status<>'approved' THEN RAISE EXCEPTION 'لا يمكن تعديل مصروف معتمد'; END IF;
  IF NEW.status='approved' AND OLD.status<>'approved' THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.post_ledger('expense_out',NEW.amount,'out','الخزنة الرئيسية','مصروفات الفرع',NEW.branch_id,NEW.employee_id,'expenses',NEW.id,NEW.description,auth.uid());
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'expenses',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_expense_ins AFTER INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.handle_expense_change();
CREATE TRIGGER trg_expense_upd BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.handle_expense_change();

CREATE OR REPLACE FUNCTION public.handle_sp_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.write_audit('create','supplier_payments',NEW.id,NULL,to_jsonb(NEW));
    RETURN NEW;
  END IF;
  IF OLD.status='approved' AND NEW.status<>'approved' THEN RAISE EXCEPTION 'لا يمكن تعديل دفعة معتمدة'; END IF;
  IF NEW.status='approved' AND OLD.status<>'approved' THEN
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
    PERFORM public.post_ledger('supplier_out',NEW.amount,'out','الخزنة الرئيسية','مورد',NEW.branch_id,NEW.employee_id,'supplier_payments',NEW.id,NEW.notes,auth.uid());
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'supplier_payments',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sp_ins AFTER INSERT ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.handle_sp_change();
CREATE TRIGGER trg_sp_upd BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.handle_sp_change();

-- salary advance limit + payment
CREATE OR REPLACE FUNCTION public.check_advance_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; used numeric; maxa numeric;
BEGIN
  SELECT salary, advance_pct INTO p FROM public.profiles WHERE id = NEW.employee_id;
  IF p IS NULL THEN RAISE EXCEPTION 'الموظف غير موجود'; END IF;
  maxa := ROUND(p.salary * p.advance_pct / 100.0, 2);
  SELECT COALESCE(SUM(amount),0) INTO used FROM public.salary_advances
   WHERE employee_id = NEW.employee_id AND status IN ('approved','paid','pending')
     AND date_trunc('month', created_at) = date_trunc('month', now());
  IF used + NEW.amount > maxa THEN
    RAISE EXCEPTION 'المبلغ يتجاوز الحد المتاح للسلفة. المتاح: % جنيه', GREATEST(maxa - used,0);
  END IF;
  PERFORM public.write_audit('create','salary_advances',NEW.id,NULL,to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_adv_ins BEFORE INSERT ON public.salary_advances FOR EACH ROW EXECUTE FUNCTION public.check_advance_limit();

CREATE OR REPLACE FUNCTION public.handle_advance_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status='paid' AND NEW.status<>'paid' THEN RAISE EXCEPTION 'لا يمكن تعديل سلفة مدفوعة'; END IF;
  IF NEW.status IN ('approved','rejected','paid') AND OLD.status <> NEW.status THEN
    NEW.approved_by := auth.uid();
  END IF;
  IF NEW.status='paid' AND OLD.status<>'paid' THEN
    NEW.paid_at := now();
    PERFORM public.post_ledger('advance_out',NEW.amount,'out','الخزنة الرئيسية','سلفة موظف',NULL,NEW.employee_id,'salary_advances',NEW.id,NEW.reason,auth.uid());
  END IF;
  PERFORM public.write_audit('status_'||NEW.status,'salary_advances',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_adv_upd BEFORE UPDATE ON public.salary_advances FOR EACH ROW EXECUTE FUNCTION public.handle_advance_update();

-- payroll payment
CREATE OR REPLACE FUNCTION public.handle_payroll_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status='paid' AND NEW.status<>'paid' THEN RAISE EXCEPTION 'لا يمكن تعديل مرتب مدفوع'; END IF;
  IF NEW.status='paid' AND OLD.status<>'paid' THEN
    NEW.paid_at := now();
    PERFORM public.post_ledger('payroll_out',NEW.net_salary,'out','الخزنة الرئيسية','مرتب موظف',NULL,NEW.employee_id,'payroll',NEW.id,NEW.period,auth.uid());
  END IF;
  PERFORM public.write_audit('payroll_'||NEW.status,'payroll',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_payroll_upd BEFORE UPDATE ON public.payroll FOR EACH ROW EXECUTE FUNCTION public.handle_payroll_update();

-- attendance GPS validation
CREATE OR REPLACE FUNCTION public.validate_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; d double precision; open_count int;
BEGIN
  SELECT latitude, longitude, radius_m, active INTO b FROM public.branches WHERE id = NEW.branch_id;
  IF b IS NULL OR NOT b.active THEN RAISE EXCEPTION 'الفرع غير متاح'; END IF;
  IF b.latitude IS NULL OR b.longitude IS NULL THEN RAISE EXCEPTION 'لم يتم ضبط إحداثيات الفرع. تواصل مع الإدارة.'; END IF;
  d := public.gps_distance_m(b.latitude, b.longitude, NEW.in_lat, NEW.in_lng);
  IF d > b.radius_m THEN
    RAISE EXCEPTION 'لا يمكنك تسجيل الحضور لأنك خارج نطاق الفرع.';
  END IF;
  SELECT count(*) INTO open_count FROM public.attendance WHERE employee_id = NEW.employee_id AND check_out_at IS NULL;
  IF open_count > 0 THEN RAISE EXCEPTION 'لديك وردية مفتوحة بالفعل'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_att_ins BEFORE INSERT ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.validate_attendance();

CREATE OR REPLACE FUNCTION public.validate_attendance_out()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; d double precision;
BEGIN
  IF NEW.check_out_at IS NOT NULL AND OLD.check_out_at IS NULL THEN
    SELECT latitude, longitude, radius_m INTO b FROM public.branches WHERE id = OLD.branch_id;
    d := public.gps_distance_m(b.latitude, b.longitude, NEW.out_lat, NEW.out_lng);
    IF d > b.radius_m THEN RAISE EXCEPTION 'لا يمكنك تسجيل الانصراف لأنك خارج نطاق الفرع.'; END IF;
  ELSIF OLD.check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'تم إنهاء هذه الوردية بالفعل';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_att_upd BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_out();

-- daily closing: recompute server-side and lock after approval
CREATE OR REPLACE FUNCTION public.branch_day_summary(_branch uuid, _date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cs numeric; ts numeric; ex numeric; sp numeric; oc numeric;
BEGIN
  IF NOT (public.is_admin() OR _branch = public.my_branch()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO cs FROM public.sales
    WHERE branch_id=_branch AND payment_method='cash' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO ts FROM public.sales
    WHERE branch_id=_branch AND payment_method='transfer' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT ts + COALESCE(SUM(amount),0) INTO ts FROM public.transfers
    WHERE branch_id=_branch AND status<>'rejected' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO ex FROM public.expenses
    WHERE branch_id=_branch AND status<>'rejected' AND payment_method='cash' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO sp FROM public.supplier_payments
    WHERE branch_id=_branch AND status<>'rejected' AND payment_method='cash' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  SELECT COALESCE(SUM(amount),0) INTO oc FROM public.expenses
    WHERE branch_id=_branch AND status<>'rejected' AND payment_method='transfer' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = _date;
  RETURN jsonb_build_object(
    'cash_sales',cs,'transfer_sales',ts,'expenses_total',ex,'supplier_total',sp,
    'other_cash_out',0,'non_cash_expenses',oc,
    'expected_cash', cs - ex - sp,
    'total_sales', cs + ts);
END; $$;

CREATE OR REPLACE FUNCTION public.handle_closing_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb;
BEGIN
  s := public.branch_day_summary(NEW.branch_id, NEW.closing_date);
  NEW.cash_sales := (s->>'cash_sales')::numeric;
  NEW.transfer_sales := (s->>'transfer_sales')::numeric;
  NEW.expenses_total := (s->>'expenses_total')::numeric;
  NEW.supplier_total := (s->>'supplier_total')::numeric;
  NEW.expected_cash := (s->>'expected_cash')::numeric;
  NEW.difference := NEW.actual_cash - NEW.expected_cash;
  NEW.status := 'pending';
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_closing_ins BEFORE INSERT ON public.daily_closings FOR EACH ROW EXECUTE FUNCTION public.handle_closing_insert();

CREATE OR REPLACE FUNCTION public.handle_closing_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status='approved' THEN RAISE EXCEPTION 'التقفيلة معتمدة ولا يمكن تعديلها'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح بتعديل التقفيلة'; END IF;
  IF NEW.status <> OLD.status THEN
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
  END IF;
  IF NEW.status='approved' AND NEW.actual_cash > 0 THEN
    PERFORM public.post_ledger('closing_cash_in',NEW.actual_cash,'in','كاش الفرع','الخزنة الرئيسية',NEW.branch_id,NEW.employee_id,'daily_closings',NEW.id,'توريد كاش تقفيلة '||NEW.closing_date,auth.uid());
  END IF;
  PERFORM public.write_audit('closing_'||NEW.status,'daily_closings',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_closing_upd BEFORE UPDATE ON public.daily_closings FOR EACH ROW EXECUTE FUNCTION public.handle_closing_update();

-- manual treasury movement (admin only)
CREATE OR REPLACE FUNCTION public.treasury_manual(_amount numeric, _dir public.ledger_dir, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'المبلغ غير صالح'; END IF;
  IF _reason IS NULL OR length(trim(_reason))=0 THEN RAISE EXCEPTION 'السبب مطلوب'; END IF;
  INSERT INTO public.ledger_entries(txn_type, amount, direction, source, destination, notes, created_by, approved_by)
  VALUES (CASE WHEN _dir='in' THEN 'treasury_deposit' ELSE 'treasury_withdraw' END, _amount, _dir,
    CASE WHEN _dir='in' THEN 'إيداع يدوي' ELSE 'الخزنة الرئيسية' END,
    CASE WHEN _dir='in' THEN 'الخزنة الرئيسية' ELSE 'سحب يدوي' END,
    _reason, auth.uid(), auth.uid())
  RETURNING id INTO nid;
  PERFORM public.write_audit('treasury_'||_dir::text,'ledger_entries',nid,NULL,jsonb_build_object('amount',_amount,'reason',_reason));
  RETURN nid;
END; $$;

-- ============ SEED (structure only, no fake financial data) ============
INSERT INTO public.companies(name) VALUES ('الشركة');
INSERT INTO public.branches(company_id, name, address, latitude, longitude, radius_m)
SELECT c.id, x.name, x.addr, x.lat, x.lng, 200 FROM public.companies c,
(VALUES
 ('جولد المطرية','المطرية - القاهرة', 30.132500, 31.315600),
 ('جولد الخلفاوي','الخلفاوي - شبرا', 30.093200, 31.242700),
 ('جولد مسكن','مساكن الحلمية', 30.117000, 31.313000)
) AS x(name, addr, lat, lng);

INSERT INTO public.expense_categories(name) VALUES ('مواصلات'),('مستلزمات'),('صيانة'),('خدمات'),('مصروفات أخرى');
INSERT INTO public.settings(key, value) VALUES ('company', jsonb_build_object('currency','EGP','name','الشركة'));
