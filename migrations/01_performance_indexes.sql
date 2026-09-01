-- =============================================================================
-- ClipPay: Migrasi Indeks Performa & Integritas Data
-- =============================================================================

-- 1. Indeks komposit untuk filter status + sorting submitted_at DESC
-- Menghilangkan biaya sorting di memori pada pagination 50.000+ baris.
CREATE INDEX IF NOT EXISTS idx_submissions_status_submitted_at
  ON submissions (status, submitted_at DESC);

-- 2. Indeks komposit untuk filter campaign + status + sorting submitted_at DESC
CREATE INDEX IF NOT EXISTS idx_submissions_campaign_status_submitted_at
  ON submissions (campaign_id, status, submitted_at DESC);

-- 3. Indeks Foreign Key creator_id pada tabel submissions
-- Postgres tidak otomatis membuat index pada kolom FK; index ini mempercepat JOIN creators.
CREATE INDEX IF NOT EXISTS idx_submissions_creator_id
  ON submissions (creator_id);

-- 4. Unique index pada submission_id di tabel earnings
-- Menjamin di level integritas skema database bahwa satu submission TIDAK BISA memiliki >1 earning (idempotent / anti double earning).
CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_submission_id
  ON earnings (submission_id);

-- 5. Indeks FK campaign_id pada tabel earnings untuk query ringkasan/agregasi cepat
CREATE INDEX IF NOT EXISTS idx_earnings_campaign_id
  ON earnings (campaign_id);
