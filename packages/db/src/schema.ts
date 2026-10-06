import {
  pgTable,
  pgEnum,
  uuid,
  bigint,
  text,
  timestamp,
  boolean,
  integer,
  foreignKey,
  unique,
  check,
  index,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const componentTypeEnum = pgEnum('component_type', ['cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case']);
export const memoryTypeEnum = pgEnum('memory_type', ['DDR4', 'DDR5']);
export const formFactorEnum = pgEnum('form_factor', ['ATX', 'mATX', 'ITX']);
export const psuFormFactorEnum = pgEnum('psu_form_factor', ['ATX', 'SFX']);
export const storageInterfaceEnum = pgEnum('storage_interface', ['sata', 'nvme']);
export const storageFormFactorEnum = pgEnum('storage_form_factor', ['2.5', 'M.2-2280']);
export const checkoutModeEnum = pgEnum('checkout_mode', ['cart', 'whatsapp']);
export const mappingStatusEnum = pgEnum('mapping_status', ['unmapped', 'suggested', 'confirmed', 'ignored']);
export const variantSourceEnum = pgEnum('variant_source', ['csv', 'api']);

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tnStoreId: bigint('tn_store_id', { mode: 'number' }).notNull().unique(),
  name: text('name').notNull(),
  checkoutMode: checkoutModeEnum('checkout_mode').notNull().default('cart'),
  whatsappNumber: text('whatsapp_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const components = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: componentTypeEnum('type').notNull(),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  canonicalName: text('canonical_name').notNull().unique(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmedBy: text('confirmed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    idTypeUnique: unique().on(table.id, table.type),
  };
});

export const cpuSpecs = pgTable('cpu_specs', {
  componentId: uuid('component_id').primaryKey(),
  type: componentTypeEnum('type').notNull(),
  socket: text('socket').notNull(),
  cores: integer('cores').notNull(),
  threads: integer('threads').notNull(),
  tdpW: integer('tdp_w').notNull(),
  hasIgpu: boolean('has_igpu').notNull(),
  igpuScore: integer('igpu_score').notNull(),
  includesCooler: boolean('includes_cooler').notNull(),
  memoryTypes: memoryTypeEnum('memory_types').array().notNull(),
  perfScore: integer('perf_score').notNull(),
}, (table) => {
  return {
    fk: foreignKey({
      columns: [table.componentId, table.type],
      foreignColumns: [components.id, components.type],
    }).onDelete('cascade'),
  };
});

export const motherboardSpecs = pgTable('motherboard_specs', {
  componentId: uuid('component_id').primaryKey(),
  type: componentTypeEnum('type').notNull(),
  socket: text('socket').notNull(),
  chipset: text('chipset').notNull(),
  formFactor: formFactorEnum('form_factor').notNull(),
  memoryType: memoryTypeEnum('memory_type').notNull(),
  memorySlots: integer('memory_slots').notNull(),
  m2Slots: integer('m2_slots').notNull(),
  sataPorts: integer('sata_ports').notNull(),
  biosNote: text('bios_note'),
}, (table) => {
  return {
    fk: foreignKey({
      columns: [table.componentId, table.type],
      foreignColumns: [components.id, components.type],
    }).onDelete('cascade'),
  };
});

export const ramSpecs = pgTable('ram_specs', {
  componentId: uuid('component_id').primaryKey(),
  type: componentTypeEnum('type').notNull(),
  memoryType: memoryTypeEnum('memory_type').notNull(),
  totalGb: integer('total_gb').notNull(),
  modules: integer('modules').notNull(),
  speedMhz: integer('speed_mhz').notNull(),
}, (table) => {
  return {
    fk: foreignKey({
      columns: [table.componentId, table.type],
      foreignColumns: [components.id, components.type],
    }).onDelete('cascade'),
  };
});

export const gpuSpecs = pgTable('gpu_specs', {
  componentId: uuid('component_id').primaryKey(),
  type: componentTypeEnum('type').notNull(),
  chipset: text('chipset').notNull(),
  vramGb: integer('vram_gb').notNull(),
  lengthMm: integer('length_mm').notNull(),
  tbpW: integer('tbp_w').notNull(),
  recommendedPsuW: integer('recommended_psu_w').notNull(),
  perfScore: integer('perf_score').notNull(),
}, (table) => {
  return {
    fk: foreignKey({
      columns: [table.componentId, table.type],
      foreignColumns: [components.id, components.type],
    }).onDelete('cascade'),
  };
});

export const storageSpecs = pgTable('storage_specs', {
  componentId: uuid('component_id').primaryKey(),
  type: componentTypeEnum('type').notNull(),
  interface: storageInterfaceEnum('interface').notNull(),
  formFactor: storageFormFactorEnum('form_factor').notNull(),
  capacityGb: integer('capacity_gb').notNull(),
}, (table) => {
  return {
    fk: foreignKey({
      columns: [table.componentId, table.type],
      foreignColumns: [components.id, components.type],
    }).onDelete('cascade'),
  };
});

export const psuSpecs = pgTable('psu_specs', {
  componentId: uuid('component_id').primaryKey(),
  type: componentTypeEnum('type').notNull(),
  wattage: integer('wattage').notNull(),
  efficiency: text('efficiency').notNull(),
  formFactor: psuFormFactorEnum('form_factor').notNull(),
}, (table) => {
  return {
    fk: foreignKey({
      columns: [table.componentId, table.type],
      foreignColumns: [components.id, components.type],
    }).onDelete('cascade'),
  };
});

export const caseSpecs = pgTable('case_specs', {
  componentId: uuid('component_id').primaryKey(),
  type: componentTypeEnum('type').notNull(),
  supportedFormFactors: formFactorEnum('supported_form_factors').array().notNull(),
  maxGpuLengthMm: integer('max_gpu_length_mm').notNull(),
  psuFormFactor: psuFormFactorEnum('psu_form_factor').notNull(),
  includedPsuWattage: integer('included_psu_wattage'),
  includedPsuEfficiency: text('included_psu_efficiency'),
  includedPsuFormFactor: psuFormFactorEnum('included_psu_form_factor'),
}, (table) => {
  return {
    fk: foreignKey({
      columns: [table.componentId, table.type],
      foreignColumns: [components.id, components.type],
    }).onDelete('cascade'),
  };
});

export const storeVariants = pgTable('store_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  tnProductId: bigint('tn_product_id', { mode: 'number' }).notNull(),
  tnVariantId: bigint('tn_variant_id', { mode: 'number' }).notNull(),
  tnHandle: text('tn_handle').notNull(),
  variantLabel: text('variant_label'),
  sku: text('sku'),
  name: text('name').notNull(),
  categoryPath: text('category_path').notNull(),
  priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
  stock: integer('stock').notNull(),
  published: boolean('published').notNull(),
  source: variantSourceEnum('source').notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  componentId: uuid('component_id').references(() => components.id, { onDelete: 'set null' }),
  mappingStatus: mappingStatusEnum('mapping_status').notNull().default('unmapped'),
  advisorEnabled: boolean('advisor_enabled').notNull().default(false),
}, (table) => {
  return {
    storeVariantUnique: unique().on(table.storeId, table.tnVariantId),
    storeHandleVariantUnique: unique('store_variants_store_id_tn_handle_variant_label_key').on(table.storeId, table.tnHandle, table.variantLabel).nullsNotDistinct(),
  };
});

export const turnRoleEnum = pgEnum('turn_role', ['user', 'assistant', 'tool']);
export const eventTypeEnum = pgEnum('event_type', ['cart_added', 'whatsapp_clicked']);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    storeSessionUnique: unique().on(table.storeId, table.sessionId),
    lastMessageAtIdx: index('conversations_last_message_at_idx').on(table.lastMessageAt),
  };
});

export const conversationTurns = pgTable('conversation_turns', {
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  role: turnRoleEnum('role').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.conversationId, table.seq] }),
    seqCheck: check('conversation_turns_seq_check', sql`${table.seq} >= 1`),
    payloadRoleCheck: check('conversation_turns_payload_role_check', sql`${table.payload}->>'role' = ${table.role}::text`),
  };
});

export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  requirements: jsonb('requirements').notNull(),
  builds: jsonb('builds').notNull(),
  cheapestValidTotalCents: bigint('cheapest_valid_total_cents', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const recommendationEvents = pgTable('recommendation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  recommendationId: uuid('recommendation_id').notNull().references(() => recommendations.id, { onDelete: 'cascade' }),
  type: eventTypeEnum('type').notNull(),
  buildId: text('build_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

