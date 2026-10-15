-- Catálogo compartido: se conserva products y su SKU para no romper el historial.
ALTER TABLE pharmacy.products
  ADD COLUMN kind text NOT NULL DEFAULT 'Medicamento' CHECK (kind IN ('Medicamento','Suministro','Equipo')),
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN saleable boolean NOT NULL DEFAULT true,
  ADD COLUMN expiration_required boolean NOT NULL DEFAULT true;
ALTER TABLE pharmacy.inventory ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE pharmacy.transfers ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE pharmacy.assets ADD COLUMN product_id uuid REFERENCES pharmacy.products(id);
-- Vincula cada activo histórico a un artículo, sin cambiar su nombre, valor ni foto.
DO $$ DECLARE a record; p uuid; BEGIN
  FOR a IN SELECT * FROM pharmacy.assets WHERE product_id IS NULL LOOP
    p := gen_random_uuid();
    INSERT INTO pharmacy.products(id,sku,name,category,price,cost,min_stock,prescription,kind,active,saleable,expiration_required)
    VALUES(p,'ACT-'||a.id::text,a.name,a.category,0,a.purchase_value,0,false,'Equipo',true,false,false);
    UPDATE pharmacy.assets SET product_id=p WHERE id=a.id;
  END LOOP;
END $$;
ALTER TABLE pharmacy.assets ALTER COLUMN product_id SET NOT NULL;
CREATE INDEX assets_product_idx ON pharmacy.assets(product_id);

CREATE TABLE pharmacy.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL DEFAULT '',
  address text NOT NULL,
  latitude numeric NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pharmacy.orders ADD COLUMN customer_id uuid REFERENCES pharmacy.customers(id);
-- Conserva cada destinatario histórico; no combina personas por coincidencia de nombre.
INSERT INTO pharmacy.customers(id,code,name,phone,address,latitude,longitude,created_at)
SELECT id,'CLI-'||id::text,customer,phone,address,latitude,longitude,created_at FROM pharmacy.orders;
UPDATE pharmacy.orders SET customer_id=id;
ALTER TABLE pharmacy.orders ALTER COLUMN customer_id SET NOT NULL;
CREATE INDEX orders_customer_idx ON pharmacy.orders(customer_id);

CREATE TABLE pharmacy.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES pharmacy.branches(id),
  supplier text NOT NULL,
  expected_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('Borrador','Confirmada','Recibida parcialmente','Recibida','Cancelada')),
  total numeric(16,2) NOT NULL CHECK (total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,branch_id)
);
CREATE TABLE pharmacy.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES pharmacy.products(id),
  item_code text NOT NULL,
  item_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= quantity),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(purchase_order_id,branch_id) REFERENCES pharmacy.purchase_orders(id,branch_id),
  UNIQUE(purchase_order_id,product_id),
  UNIQUE(id,purchase_order_id,branch_id)
);
CREATE TABLE pharmacy.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL,
  purchase_line_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  inventory_id uuid NOT NULL REFERENCES pharmacy.inventory(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  reference text NOT NULL,
  actor_id uuid NOT NULL REFERENCES pharmacy.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(purchase_line_id,purchase_order_id,branch_id) REFERENCES pharmacy.purchase_order_lines(id,purchase_order_id,branch_id),
  UNIQUE(purchase_line_id,reference)
);
CREATE INDEX purchase_orders_branch_idx ON pharmacy.purchase_orders(branch_id,status);
CREATE INDEX purchase_order_lines_order_idx ON pharmacy.purchase_order_lines(purchase_order_id);
CREATE INDEX purchase_receipts_order_idx ON pharmacy.purchase_receipts(purchase_order_id);
ALTER TABLE pharmacy.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy.purchase_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pharmacy.customers,pharmacy.purchase_orders,pharmacy.purchase_order_lines,pharmacy.purchase_receipts FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable_purchase_receipts BEFORE UPDATE OR DELETE ON pharmacy.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION pharmacy.prevent_ledger_mutation();
