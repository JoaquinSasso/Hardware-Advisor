import type { CatalogItem } from '@pcadvisor/shared';

export type Part = { item: CatalogItem; qty: number };

export type CpuItem = Extract<CatalogItem, { type: 'cpu' }>;
export type MotherboardItem = Extract<CatalogItem, { type: 'motherboard' }>;
export type RamItem = Extract<CatalogItem, { type: 'ram' }>;
export type GpuItem = Extract<CatalogItem, { type: 'gpu' }>;
export type StorageItem = Extract<CatalogItem, { type: 'storage' }>;
export type PsuItem = Extract<CatalogItem, { type: 'psu' }>;
export type CaseItem = Extract<CatalogItem, { type: 'case' }>;
