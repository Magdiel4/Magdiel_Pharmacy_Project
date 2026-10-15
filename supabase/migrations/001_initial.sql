-- Farmacias Alvarado. Esquema aislado: no modifica tablas existentes en public.
CREATE SCHEMA IF NOT EXISTS pharmacy;
CREATE TABLE IF NOT EXISTS pharmacy.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE pharmacy.branches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, department text NOT NULL, address text NOT NULL,
 type text NOT NULL CHECK(type IN ('Centro comercial','Gasolinera')), latitude numeric NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude numeric NOT NULL CHECK(longitude BETWEEN -180 AND 180), phone text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pharmacy.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE, name text NOT NULL, category text NOT NULL,
 price numeric(14,2) NOT NULL CHECK(price>=0), cost numeric(14,2) NOT NULL CHECK(cost>=0), min_stock integer NOT NULL CHECK(min_stock>=0),
 prescription boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pharmacy.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id), name text NOT NULL, email text NOT NULL UNIQUE,
 role text NOT NULL CHECK(role IN ('administrador','auditor','gerente','cajero','logistica','rrhh')),
 branch_id uuid REFERENCES pharmacy.branches(id), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(role NOT IN ('gerente','cajero') OR branch_id IS NOT NULL)
);
CREATE TABLE pharmacy.inventory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES pharmacy.branches(id), product_id uuid NOT NULL REFERENCES pharmacy.products(id),
 lot text NOT NULL, expires_at date NOT NULL, quantity integer NOT NULL CHECK(quantity>=0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=quantity),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(branch_id,product_id,lot)
);
CREATE TABLE pharmacy.transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES pharmacy.branches(id), destination_id uuid NOT NULL REFERENCES pharmacy.branches(id),
 batch_id uuid NOT NULL REFERENCES pharmacy.inventory(id), product_id uuid NOT NULL REFERENCES pharmacy.products(id), quantity integer NOT NULL CHECK(quantity>0),
 lot text NOT NULL, expires_at date NOT NULL, note text NOT NULL, status text NOT NULL CHECK(status IN ('En tránsito','Recibido')),
 received_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK(source_id<>destination_id)
);
CREATE TABLE pharmacy.stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES pharmacy.branches(id), product_id uuid NOT NULL REFERENCES pharmacy.products(id),
 batch_id uuid NOT NULL REFERENCES pharmacy.inventory(id), quantity integer NOT NULL CHECK(quantity<>0), type text NOT NULL, reference text NOT NULL,
 actor_id uuid NOT NULL REFERENCES pharmacy.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pharmacy.employees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, position text NOT NULL, branch_id uuid NOT NULL REFERENCES pharmacy.branches(id),
 salary numeric(14,2) NOT NULL CHECK(salary>=0), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pharmacy.payroll (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES pharmacy.employees(id), branch_id uuid NOT NULL REFERENCES pharmacy.branches(id),
 period text NOT NULL CHECK(period ~ '^\d{4}-(0[1-9]|1[0-2])$'), base_salary numeric(14,2) NOT NULL CHECK(base_salary>=0), bonus numeric(14,2) NOT NULL CHECK(bonus>=0),
 deductions numeric(14,2) NOT NULL CHECK(deductions>=0), net numeric(14,2) NOT NULL CHECK(net>0), status text NOT NULL CHECK(status IN ('Pendiente','Pagado')),
 paid_at timestamptz, payment_reference text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(employee_id,period), CHECK(net=base_salary+bonus-deductions)
);
CREATE TABLE pharmacy.assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL, branch_id uuid NOT NULL REFERENCES pharmacy.branches(id), category text NOT NULL,
 purchase_date date NOT NULL, purchase_value numeric(14,2) NOT NULL CHECK(purchase_value>=0), residual_value numeric(14,2) NOT NULL CHECK(residual_value>=0 AND residual_value<=purchase_value),
 useful_life_months integer NOT NULL CHECK(useful_life_months>0), status text NOT NULL CHECK(status IN ('Operativo','Mantenimiento','Baja')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pharmacy.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES pharmacy.branches(id), product_id uuid NOT NULL REFERENCES pharmacy.products(id),
 quantity integer NOT NULL CHECK(quantity>0), customer text NOT NULL, phone text NOT NULL, address text NOT NULL, latitude numeric NOT NULL, longitude numeric NOT NULL,
 payment_method text NOT NULL CHECK(payment_method IN ('Efectivo','Tarjeta','Transferencia')), prescription_verified boolean NOT NULL DEFAULT false,
 total numeric(14,2) NOT NULL CHECK(total>=0), status text NOT NULL CHECK(status IN ('Preparando','En ruta','Entregado','Cancelado')), eta_minutes integer NOT NULL CHECK(eta_minutes>=0),
 promised_at timestamptz NOT NULL, delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pharmacy.order_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES pharmacy.orders(id), batch_id uuid NOT NULL REFERENCES pharmacy.inventory(id),
 quantity integer NOT NULL CHECK(quantity>0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,batch_id)
);
CREATE TABLE pharmacy.cash_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES pharmacy.branches(id), type text NOT NULL CHECK(type IN ('Ingreso','Egreso')),
 amount numeric(14,2) NOT NULL CHECK(amount>0), method text NOT NULL CHECK(method IN ('Efectivo','Tarjeta','Transferencia')), concept text NOT NULL, reference text NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('manual','payroll','order')), source_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(branch_id,reference), UNIQUE(source_type,source_id)
);
CREATE TABLE pharmacy.audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES pharmacy.profiles(id), actor_name text NOT NULL, branch_id uuid REFERENCES pharmacy.branches(id),
 action text NOT NULL, entity text NOT NULL, entity_id uuid NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_availability_idx ON pharmacy.inventory(branch_id,product_id,expires_at);
CREATE INDEX cash_branch_date_idx ON pharmacy.cash_entries(branch_id,created_at DESC);
CREATE INDEX orders_dispatch_idx ON pharmacy.orders(branch_id,status,promised_at);
CREATE INDEX audit_date_idx ON pharmacy.audit_log(created_at DESC);
CREATE INDEX movements_branch_date_idx ON pharmacy.stock_movements(branch_id,created_at DESC);
CREATE INDEX employees_branch_idx ON pharmacy.employees(branch_id);
CREATE INDEX assets_branch_idx ON pharmacy.assets(branch_id);
CREATE INDEX payroll_branch_period_idx ON pharmacy.payroll(branch_id,period);
CREATE INDEX transfers_source_idx ON pharmacy.transfers(source_id,status);
CREATE INDEX transfers_destination_idx ON pharmacy.transfers(destination_id,status);
-- Acceso a datos exclusivamente desde el backend, autenticado con Supabase Auth.
-- Ninguna clave anon/authenticated puede leer o escribir estas tablas directamente.
REVOKE ALL ON SCHEMA pharmacy FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA pharmacy FROM PUBLIC, anon, authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='pharmacy' LOOP
  EXECUTE format('ALTER TABLE pharmacy.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
END $$;
CREATE FUNCTION pharmacy.prevent_ledger_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pharmacy,pg_temp AS $$
 BEGIN RAISE EXCEPTION 'Los registros de auditoría y libro de movimientos son inmutables'; END;
$$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON pharmacy.audit_log FOR EACH ROW EXECUTE FUNCTION pharmacy.prevent_ledger_mutation();
CREATE TRIGGER immutable_cash BEFORE UPDATE OR DELETE ON pharmacy.cash_entries FOR EACH ROW EXECUTE FUNCTION pharmacy.prevent_ledger_mutation();
CREATE TRIGGER immutable_stock BEFORE UPDATE OR DELETE ON pharmacy.stock_movements FOR EACH ROW EXECUTE FUNCTION pharmacy.prevent_ledger_mutation();
