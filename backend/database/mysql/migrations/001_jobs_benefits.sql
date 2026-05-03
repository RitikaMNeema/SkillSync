-- Add structured benefits (JSON array of strings) for jobs.
-- Run manually if your database was created before this column existed:
--   mysql -u ... -p skillsync < backend/database/mysql/migrations/001_jobs_benefits.sql

ALTER TABLE jobs
  ADD COLUMN benefits JSON NULL AFTER skills_required;
