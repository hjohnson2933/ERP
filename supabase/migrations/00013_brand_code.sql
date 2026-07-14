-- ════════════════════════════════════════════════════════════════
-- ERP — add a human-assigned Brand ID to brands.
--
-- Stored as brand_code (the column name brand_id is already used across
-- the schema as the FK to erp.brands, so this avoids confusion). Shown in
-- the UI as "Brand ID". Optional free-text identifier.
--
-- Run after 00012.
-- ════════════════════════════════════════════════════════════════

alter table erp.brands
  add column if not exists brand_code text not null default '';
