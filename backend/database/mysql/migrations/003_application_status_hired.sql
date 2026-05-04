-- Idempotent-friendly: full ENUM list including hired (MySQL requires full list on MODIFY).
-- Database is selected by the mysql CLI (see ensure-hired-enum.sh).

ALTER TABLE applications
  MODIFY COLUMN status ENUM(
    'submitted',
    'reviewing',
    'interview',
    'offer',
    'rejected',
    'withdrawn',
    'hired'
  ) NOT NULL DEFAULT 'submitted';
