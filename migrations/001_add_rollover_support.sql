-- Migration: Add Rollover Support for Bankrolls
-- Description: Adds rollover_from_bankroll_id to bankrolls table for tracing bankroll rollover lineage.

ALTER TABLE bankrolls ADD COLUMN IF NOT EXISTS rollover_from_bankroll_id UUID REFERENCES bankrolls(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bankrolls_rollover ON bankrolls(rollover_from_bankroll_id);
