CREATE DATABASE IF NOT EXISTS linkedin_db;
USE linkedin_db;

-- ── users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('member', 'recruiter') NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users (email);

-- ── companies ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  company_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  industry    VARCHAR(255),
  size        VARCHAR(100)
);

-- ── members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  member_id         BIGINT UNSIGNED PRIMARY KEY,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  phone             VARCHAR(30),
  location_city     VARCHAR(100),
  location_state    VARCHAR(100),
  location_country  VARCHAR(100),
  headline          VARCHAR(255),
  summary           TEXT,
  experience        JSON,
  education         JSON,
  skills            JSON,
  profile_photo_url VARCHAR(512),
  resume_url        VARCHAR(512),
  connections_count INT UNSIGNED DEFAULT 0,
  profile_views     INT UNSIGNED DEFAULT 0,
  is_deleted        TINYINT(1) DEFAULT 0,
  CONSTRAINT fk_members_user FOREIGN KEY (member_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ── recruiters ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiters (
  recruiter_id BIGINT UNSIGNED PRIMARY KEY,
  company_id   BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(200) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  phone        VARCHAR(30),
  role         VARCHAR(100),
  access_level VARCHAR(50),
  CONSTRAINT fk_recruiters_user    FOREIGN KEY (recruiter_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_recruiters_company FOREIGN KEY (company_id)   REFERENCES companies (company_id) ON DELETE CASCADE
);

-- ── connections ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connections (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id_1    BIGINT UNSIGNED NOT NULL,
  user_id_2    BIGINT UNSIGNED NOT NULL,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_connection (user_id_1, user_id_2),
  CONSTRAINT fk_conn_u1 FOREIGN KEY (user_id_1) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conn_u2 FOREIGN KEY (user_id_2) REFERENCES users (id) ON DELETE CASCADE
);

-- ── connection_requests ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connection_requests (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id BIGINT UNSIGNED NOT NULL,
  receiver_id  BIGINT UNSIGNED NOT NULL,
  status       ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_requester FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_receiver  FOREIGN KEY (receiver_id)  REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_cr_receiver_id ON connection_requests (receiver_id);

-- ── jobs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  job_id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id        BIGINT UNSIGNED NOT NULL,
  recruiter_id      BIGINT UNSIGNED NOT NULL,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  seniority_level   VARCHAR(100),
  employment_type   VARCHAR(100),
  location          VARCHAR(255),
  work_mode         ENUM('remote', 'hybrid', 'onsite') NOT NULL,
  skills_required   JSON,
  salary_min        DECIMAL(12, 2),
  salary_max        DECIMAL(12, 2),
  posted_datetime   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status            ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  views_count       INT UNSIGNED DEFAULT 0,
  applicants_count  INT UNSIGNED DEFAULT 0,
  CONSTRAINT fk_jobs_company   FOREIGN KEY (company_id)   REFERENCES companies (company_id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_recruiter FOREIGN KEY (recruiter_id) REFERENCES recruiters (recruiter_id) ON DELETE CASCADE
);

CREATE INDEX idx_jobs_status       ON jobs (status);
CREATE INDEX idx_jobs_location     ON jobs (location);
CREATE INDEX idx_jobs_recruiter_id ON jobs (recruiter_id);

-- ── saved_jobs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_jobs (
  id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT UNSIGNED NOT NULL,
  job_id    BIGINT UNSIGNED NOT NULL,
  saved_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_saved_job (member_id, job_id),
  CONSTRAINT fk_sj_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE,
  CONSTRAINT fk_sj_job    FOREIGN KEY (job_id)    REFERENCES jobs (job_id)       ON DELETE CASCADE
);

-- ── applications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  application_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id               BIGINT UNSIGNED NOT NULL,
  member_id            BIGINT UNSIGNED NOT NULL,
  resume_url           VARCHAR(512),
  cover_letter         TEXT,
  application_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status               ENUM('submitted', 'reviewing', 'interview', 'offer', 'rejected', 'withdrawn') NOT NULL DEFAULT 'submitted',
  answers              JSON,
  UNIQUE KEY uq_application (job_id, member_id),
  CONSTRAINT fk_app_job    FOREIGN KEY (job_id)    REFERENCES jobs (job_id)       ON DELETE CASCADE,
  CONSTRAINT fk_app_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
);

CREATE INDEX idx_apps_job_id    ON applications (job_id);
CREATE INDEX idx_apps_member_id ON applications (member_id);
CREATE INDEX idx_apps_status    ON applications (status);

-- ── application_notes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS application_notes (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL,
  recruiter_id   BIGINT UNSIGNED NOT NULL,
  note_text      TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_note_app       FOREIGN KEY (application_id) REFERENCES applications (application_id) ON DELETE CASCADE,
  CONSTRAINT fk_note_recruiter FOREIGN KEY (recruiter_id)   REFERENCES recruiters (recruiter_id)     ON DELETE CASCADE
);
