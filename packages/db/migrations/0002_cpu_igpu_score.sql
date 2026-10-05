ALTER TABLE cpu_specs ADD COLUMN igpu_score int NOT NULL DEFAULT 0
  CHECK (igpu_score BETWEEN 0 AND 100);
-- Filas existentes: valor provisorio para que la restricción sea válida;
-- seed:components carga los valores reales.
UPDATE cpu_specs SET igpu_score = 1 WHERE has_igpu;
ALTER TABLE cpu_specs ALTER COLUMN igpu_score DROP DEFAULT;
ALTER TABLE cpu_specs ADD CONSTRAINT cpu_igpu_consistency CHECK (
  (has_igpu AND igpu_score >= 1) OR (NOT has_igpu AND igpu_score = 0));
