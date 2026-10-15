-- Una fotografía por lote de inventario y por activo fijo.
-- Los bytes se guardan en PostgreSQL, con acceso mediante el backend autenticado.
ALTER TABLE pharmacy.inventory
  ADD COLUMN image_data bytea,
  ADD COLUMN image_updated_at timestamptz,
  ADD CONSTRAINT inventory_image_size CHECK (
    image_data IS NULL OR octet_length(image_data) BETWEEN 1 AND 2097152
  ),
  ADD CONSTRAINT inventory_image_timestamp CHECK (
    (image_data IS NULL) = (image_updated_at IS NULL)
  );

ALTER TABLE pharmacy.assets
  ADD COLUMN image_data bytea,
  ADD COLUMN image_updated_at timestamptz,
  ADD CONSTRAINT assets_image_size CHECK (
    image_data IS NULL OR octet_length(image_data) BETWEEN 1 AND 2097152
  ),
  ADD CONSTRAINT assets_image_timestamp CHECK (
    (image_data IS NULL) = (image_updated_at IS NULL)
  );

COMMENT ON COLUMN pharmacy.inventory.image_data IS
  'Fotografía del lote convertida a WebP por el servidor; máximo 2 MiB.';
COMMENT ON COLUMN pharmacy.assets.image_data IS
  'Fotografía del activo convertida a WebP por el servidor; máximo 2 MiB.';
