-- Pedidos de varias líneas. Conserva pedidos, reservas y cobros anteriores.
CREATE TABLE pharmacy.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES pharmacy.orders(id),
  branch_id uuid NOT NULL REFERENCES pharmacy.branches(id),
  product_id uuid NOT NULL REFERENCES pharmacy.products(id),
  sku text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  total numeric(14,2) NOT NULL CHECK (total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id),
  UNIQUE (order_id, id)
);

INSERT INTO pharmacy.order_lines
  (id, order_id, branch_id, product_id, sku, name, quantity, unit_price, total, created_at)
SELECT o.id, o.id, o.branch_id, o.product_id, p.sku, p.name, o.quantity,
       round(o.total / o.quantity, 2), o.total, o.created_at
FROM pharmacy.orders o JOIN pharmacy.products p ON p.id = o.product_id;

ALTER TABLE pharmacy.order_allocations ADD COLUMN order_line_id uuid;
UPDATE pharmacy.order_allocations SET order_line_id = order_id;
ALTER TABLE pharmacy.order_allocations ALTER COLUMN order_line_id SET NOT NULL;
ALTER TABLE pharmacy.order_allocations ADD CONSTRAINT order_allocation_line_fk
  FOREIGN KEY (order_id, order_line_id) REFERENCES pharmacy.order_lines(order_id, id);

-- Compatibilidad: product_id solo se informa para pedidos de una línea;
-- quantity es el total de unidades. El detalle autoritativo está en order_lines.
ALTER TABLE pharmacy.orders ALTER COLUMN product_id DROP NOT NULL;
CREATE INDEX order_lines_branch_idx ON pharmacy.order_lines(branch_id);
CREATE INDEX order_allocations_line_idx ON pharmacy.order_allocations(order_line_id);
ALTER TABLE pharmacy.order_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pharmacy.order_lines FROM PUBLIC, anon, authenticated;
