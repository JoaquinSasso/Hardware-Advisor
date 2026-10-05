CREATE TYPE component_type AS ENUM ('cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case');
CREATE TYPE memory_type AS ENUM ('DDR4', 'DDR5');
CREATE TYPE form_factor AS ENUM ('ATX', 'mATX', 'ITX');
CREATE TYPE psu_form_factor AS ENUM ('ATX', 'SFX');
CREATE TYPE storage_interface AS ENUM ('sata', 'nvme');
CREATE TYPE storage_form_factor AS ENUM ('2.5', 'M.2-2280');
CREATE TYPE checkout_mode AS ENUM ('cart', 'whatsapp');
CREATE TYPE mapping_status AS ENUM ('unmapped', 'suggested', 'confirmed', 'ignored');
CREATE TYPE variant_source AS ENUM ('csv', 'api');

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tn_store_id bigint NOT NULL UNIQUE,
  name text NOT NULL,
  checkout_mode checkout_mode NOT NULL DEFAULT 'cart',
  whatsapp_number text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type component_type NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  canonical_name text NOT NULL UNIQUE,
  confirmed_at timestamptz NULL,
  confirmed_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, type)
);

CREATE TABLE cpu_specs (
  component_id uuid PRIMARY KEY,
  type component_type NOT NULL CHECK (type = 'cpu'),
  socket text NOT NULL,
  cores int NOT NULL CHECK (cores > 0),
  threads int NOT NULL CHECK (threads >= cores),
  tdp_w int NOT NULL CHECK (tdp_w > 0),
  has_igpu boolean NOT NULL,
  includes_cooler boolean NOT NULL,
  memory_types memory_type[] NOT NULL CHECK (cardinality(memory_types) >= 1),
  perf_score int NOT NULL CHECK (perf_score BETWEEN 1 AND 100),
  FOREIGN KEY (component_id, type) REFERENCES components(id, type) ON DELETE CASCADE
);

CREATE TABLE motherboard_specs (
  component_id uuid PRIMARY KEY,
  type component_type NOT NULL CHECK (type = 'motherboard'),
  socket text NOT NULL,
  chipset text NOT NULL,
  form_factor form_factor NOT NULL,
  memory_type memory_type NOT NULL,
  memory_slots int NOT NULL CHECK (memory_slots > 0),
  m2_slots int NOT NULL CHECK (m2_slots >= 0),
  sata_ports int NOT NULL CHECK (sata_ports >= 0),
  bios_note text NULL,
  FOREIGN KEY (component_id, type) REFERENCES components(id, type) ON DELETE CASCADE
);

CREATE TABLE ram_specs (
  component_id uuid PRIMARY KEY,
  type component_type NOT NULL CHECK (type = 'ram'),
  memory_type memory_type NOT NULL,
  total_gb int NOT NULL CHECK (total_gb > 0),
  modules int NOT NULL CHECK (modules > 0),
  speed_mhz int NOT NULL CHECK (speed_mhz > 0),
  FOREIGN KEY (component_id, type) REFERENCES components(id, type) ON DELETE CASCADE
);

CREATE TABLE gpu_specs (
  component_id uuid PRIMARY KEY,
  type component_type NOT NULL CHECK (type = 'gpu'),
  chipset text NOT NULL,
  vram_gb int NOT NULL CHECK (vram_gb > 0),
  length_mm int NOT NULL CHECK (length_mm > 0),
  tbp_w int NOT NULL CHECK (tbp_w > 0),
  recommended_psu_w int NOT NULL CHECK (recommended_psu_w > 0),
  perf_score int NOT NULL CHECK (perf_score BETWEEN 1 AND 100),
  FOREIGN KEY (component_id, type) REFERENCES components(id, type) ON DELETE CASCADE
);

CREATE TABLE storage_specs (
  component_id uuid PRIMARY KEY,
  type component_type NOT NULL CHECK (type = 'storage'),
  interface storage_interface NOT NULL,
  form_factor storage_form_factor NOT NULL,
  capacity_gb int NOT NULL CHECK (capacity_gb > 0),
  FOREIGN KEY (component_id, type) REFERENCES components(id, type) ON DELETE CASCADE
);

CREATE TABLE psu_specs (
  component_id uuid PRIMARY KEY,
  type component_type NOT NULL CHECK (type = 'psu'),
  wattage int NOT NULL CHECK (wattage > 0),
  efficiency text NOT NULL,
  form_factor psu_form_factor NOT NULL,
  FOREIGN KEY (component_id, type) REFERENCES components(id, type) ON DELETE CASCADE
);

CREATE TABLE case_specs (
  component_id uuid PRIMARY KEY,
  type component_type NOT NULL CHECK (type = 'case'),
  supported_form_factors form_factor[] NOT NULL CHECK (cardinality(supported_form_factors) >= 1),
  max_gpu_length_mm int NOT NULL CHECK (max_gpu_length_mm > 0),
  psu_form_factor psu_form_factor NOT NULL,
  included_psu_wattage int NULL,
  included_psu_efficiency text NULL,
  included_psu_form_factor psu_form_factor NULL,
  CHECK ((included_psu_wattage IS NULL AND included_psu_efficiency IS NULL AND included_psu_form_factor IS NULL)
         OR (included_psu_wattage IS NOT NULL AND included_psu_efficiency IS NOT NULL AND included_psu_form_factor IS NOT NULL)),
  FOREIGN KEY (component_id, type) REFERENCES components(id, type) ON DELETE CASCADE
);

CREATE TABLE store_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tn_product_id bigint NOT NULL,
  tn_variant_id bigint NOT NULL,
  tn_handle text NOT NULL,
  variant_label text NULL,
  sku text NULL,
  name text NOT NULL,
  category_path text NOT NULL,
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  stock int NOT NULL CHECK (stock >= 0),
  published boolean NOT NULL,
  source variant_source NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  component_id uuid NULL REFERENCES components(id) ON DELETE SET NULL,
  mapping_status mapping_status NOT NULL DEFAULT 'unmapped',
  advisor_enabled boolean NOT NULL DEFAULT false,
  UNIQUE (store_id, tn_variant_id),
  UNIQUE NULLS NOT DISTINCT (store_id, tn_handle, variant_label),
  CHECK (NOT advisor_enabled OR (mapping_status = 'confirmed' AND component_id IS NOT NULL)),
  CHECK (mapping_status <> 'confirmed' OR component_id IS NOT NULL)
);
