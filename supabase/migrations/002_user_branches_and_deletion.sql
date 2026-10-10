-- Mantiene el alcance de cada cuenta existente y conserva su historial al eliminarla.
ALTER TABLE pharmacy.profiles ADD COLUMN branch_ids uuid[];
ALTER TABLE pharmacy.profiles ADD COLUMN deleted_at timestamptz;
ALTER TABLE pharmacy.profiles ADD COLUMN deletion_pending boolean NOT NULL DEFAULT false;
UPDATE pharmacy.profiles SET branch_ids = ARRAY[branch_id] WHERE branch_id IS NOT NULL;
-- NULL significa Todas las sucursales; una lista vacía no es un alcance válido.
ALTER TABLE pharmacy.profiles ADD CONSTRAINT profiles_branch_ids_valid CHECK (
  branch_ids IS NULL OR (cardinality(branch_ids) > 0 AND array_position(branch_ids, NULL) IS NULL)
);
ALTER TABLE pharmacy.profiles ADD CONSTRAINT profiles_deleted_inactive CHECK (
  (deleted_at IS NULL AND NOT deletion_pending) OR NOT active
);
-- Sustituye la restricción antigua que solo admitía una sucursal para gerente/cajero.
DO $$ DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'pharmacy.profiles'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%branch_id IS NOT NULL%'
  LOOP EXECUTE format('ALTER TABLE pharmacy.profiles DROP CONSTRAINT %I', constraint_name); END LOOP;
END $$;
ALTER TABLE pharmacy.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
CREATE UNIQUE INDEX profiles_current_email ON pharmacy.profiles(email) WHERE deleted_at IS NULL;
