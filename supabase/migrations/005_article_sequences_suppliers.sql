-- Conserva UUID, inventario, fotos e historial. Normaliza únicamente códigos y grupos.
ALTER TABLE pharmacy.products RENAME COLUMN kind TO article_group;
ALTER TABLE pharmacy.products DROP CONSTRAINT products_kind_check;
UPDATE pharmacy.products SET article_group = CASE article_group
  WHEN 'Medicamento' THEN 'Medicamentos' WHEN 'Suministro' THEN 'Suministros' ELSE 'Activos' END;
ALTER TABLE pharmacy.products ALTER COLUMN article_group SET DEFAULT 'Medicamentos';
ALTER TABLE pharmacy.products ADD CONSTRAINT products_article_group_check
  CHECK(article_group IN ('Medicamentos','Suministros','Activos'));
ALTER TABLE pharmacy.products ADD COLUMN previous_sku text;
UPDATE pharmacy.products SET previous_sku=sku, sku='MIG005-'||id::text;
WITH numbered AS (
  SELECT id, CASE article_group WHEN 'Medicamentos' THEN 'MED' WHEN 'Suministros' THEN 'SUM' ELSE 'ACT' END AS prefix,
    row_number() OVER(PARTITION BY article_group ORDER BY created_at,id) AS n FROM pharmacy.products
)
UPDATE pharmacy.products p SET sku=n.prefix||'-'||lpad(n.n::text,greatest(3,length(n.n::text)),'0')
FROM numbered n WHERE n.id=p.id;
ALTER TABLE pharmacy.products ADD CONSTRAINT products_group_code_check CHECK (
  sku ~ ('^'||CASE article_group WHEN 'Medicamentos' THEN 'MED' WHEN 'Suministros' THEN 'SUM' ELSE 'ACT' END||'-[0-9]{3,}$')
);
CREATE TABLE pharmacy.article_sequences (
  article_group text PRIMARY KEY CHECK(article_group IN ('Medicamentos','Suministros','Activos')),
  last_value bigint NOT NULL CHECK(last_value >= 0)
);
INSERT INTO pharmacy.article_sequences(article_group,last_value)
SELECT g, (SELECT count(*) FROM pharmacy.products WHERE article_group=g)
FROM unnest(ARRAY['Medicamentos','Suministros','Activos']) g;
CREATE FUNCTION pharmacy.next_article_code(p_group text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; prefix text;
BEGIN
  prefix := CASE p_group WHEN 'Medicamentos' THEN 'MED' WHEN 'Suministros' THEN 'SUM' WHEN 'Activos' THEN 'ACT' END;
  IF prefix IS NULL THEN RAISE EXCEPTION 'Grupo de artículos inválido'; END IF;
  UPDATE pharmacy.article_sequences SET last_value=last_value+1 WHERE article_group=p_group RETURNING last_value INTO n;
  IF n IS NULL THEN RAISE EXCEPTION 'Secuencia no configurada'; END IF;
  RETURN prefix||'-'||lpad(n::text,greatest(3,length(n::text)),'0');
END $$;
ALTER TABLE pharmacy.article_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pharmacy.article_sequences FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION pharmacy.next_article_code(text) FROM PUBLIC,anon,authenticated;

CREATE TABLE pharmacy.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account text NOT NULL UNIQUE,
  name text NOT NULL, supplier_type text NOT NULL CHECK(supplier_type IN ('Laboratorio','Distribuidor','Fabricante','Servicios','Otro')),
  description text NOT NULL DEFAULT '', nit text UNIQUE, address text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
  needs_review boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(needs_review OR (nit IS NOT NULL AND length(trim(nit)) > 0)),
  CHECK(NOT needs_review OR NOT active)
);
ALTER TABLE pharmacy.purchase_orders ADD COLUMN supplier_id uuid REFERENCES pharmacy.suppliers(id);
INSERT INTO pharmacy.suppliers(account,name,supplier_type,nit,active,needs_review)
SELECT 'LEG-'||gen_random_uuid()::text,supplier,'Otro',NULL,false,true
FROM pharmacy.purchase_orders GROUP BY supplier;
UPDATE pharmacy.purchase_orders p SET supplier_id=s.id FROM pharmacy.suppliers s WHERE p.supplier=s.name;
ALTER TABLE pharmacy.purchase_orders ALTER COLUMN supplier_id SET NOT NULL;
ALTER TABLE pharmacy.purchase_orders ADD COLUMN deleted_at timestamptz;
ALTER TABLE pharmacy.purchase_orders DROP CONSTRAINT purchase_orders_status_check;
UPDATE pharmacy.purchase_orders SET status='Creado' WHERE status='Borrador';
ALTER TABLE pharmacy.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK(status IN ('Creado','Confirmada','Recibida parcialmente','Recibida','Cancelada'));
ALTER TABLE pharmacy.purchase_orders ADD CONSTRAINT purchase_orders_deleted_state_check
  CHECK(deleted_at IS NULL OR status='Creado');
CREATE INDEX purchase_orders_supplier_idx ON pharmacy.purchase_orders(supplier_id);
ALTER TABLE pharmacy.suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pharmacy.suppliers FROM PUBLIC,anon,authenticated;
