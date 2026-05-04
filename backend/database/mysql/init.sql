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
  size        VARCHAR(100),
  location    VARCHAR(255) NULL
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
  headline          VARCHAR(220),
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

CREATE TABLE IF NOT EXISTS experience (
  experience_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id          BIGINT UNSIGNED NOT NULL,
  sort_order         INT UNSIGNED NOT NULL DEFAULT 0,
  title              VARCHAR(255) NOT NULL,
  employment_type    VARCHAR(100),
  company            VARCHAR(255) NOT NULL,
  is_current         TINYINT(1) NOT NULL DEFAULT 0,
  start_month        VARCHAR(20),
  start_year         SMALLINT UNSIGNED,
  end_month          VARCHAR(20),
  end_year           SMALLINT UNSIGNED,
  location           VARCHAR(255),
  location_type      VARCHAR(100),
  description        TEXT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_experience_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
);

CREATE INDEX idx_experience_member ON experience (member_id, sort_order);

CREATE TABLE IF NOT EXISTS education (
  education_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id          BIGINT UNSIGNED NOT NULL,
  sort_order         INT UNSIGNED NOT NULL DEFAULT 0,
  school             VARCHAR(255) NOT NULL,
  degree             VARCHAR(255),
  field_of_study     VARCHAR(255),
  start_month        VARCHAR(20),
  start_year         SMALLINT UNSIGNED,
  end_month          VARCHAR(20),
  end_year           SMALLINT UNSIGNED,
  grade              VARCHAR(80),
  activities         TEXT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_education_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
);

CREATE INDEX idx_education_member ON education (member_id, sort_order);

CREATE TABLE IF NOT EXISTS skills (
  skill_id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id          BIGINT UNSIGNED NOT NULL,
  sort_order         INT UNSIGNED NOT NULL DEFAULT 0,
  skill_name         VARCHAR(255) NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_skills_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
);

CREATE INDEX idx_skills_member ON skills (member_id, sort_order);
CREATE INDEX idx_skills_name ON skills (skill_name);

CREATE TABLE IF NOT EXISTS member_skill_mappings (
  mapping_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT UNSIGNED NOT NULL,
  skill_name VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_skill_map_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
);

CREATE INDEX idx_skill_map_member ON member_skill_mappings (member_id, source_type, source_order);
CREATE INDEX idx_skill_map_skill ON member_skill_mappings (member_id, skill_name);

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

-- ── member_network_scores (graph metrics cache; optional batch job fills rows) ──
CREATE TABLE IF NOT EXISTS member_network_scores (
  member_id               BIGINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'users.id (member or recruiter)',
  degree                  INT UNSIGNED NOT NULL DEFAULT 0,
  pagerank_score          DECIMAL(8, 4) NOT NULL DEFAULT 0.0000 COMMENT '0-100 normalized',
  betweenness_score       DECIMAL(12, 8) NOT NULL DEFAULT 0.00000000 COMMENT '0-100 normalized',
  community_id            INT NOT NULL DEFAULT 0,
  network_rank_percentile DECIMAL(6, 3) NOT NULL DEFAULT 0.000 COMMENT '0-100 degree percentile among members',
  computed_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- ── user_blocks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_block (blocker_id, blocked_id),
  CONSTRAINT fk_blocker FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_blocked FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
);

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
  benefits          JSON,
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

-- ── members profile extensions (additive only; base members DDL unchanged above) ──
ALTER TABLE members
  ADD COLUMN profile_photo_file_id VARCHAR(64) NULL AFTER profile_photo_url,
  ADD COLUMN cover_photo_file_id VARCHAR(64) NULL AFTER profile_photo_file_id,
  ADD COLUMN cover_photo_url VARCHAR(512) NULL AFTER cover_photo_file_id,
  ADD COLUMN resume_file_id VARCHAR(64) NULL AFTER resume_url,
  ADD COLUMN resume_file_name VARCHAR(255) NULL AFTER resume_file_id,
  ADD COLUMN resume_content_type VARCHAR(100) NULL AFTER resume_file_name,
  ADD COLUMN resume_uploaded_at TIMESTAMP NULL DEFAULT NULL AFTER resume_content_type,
  ADD COLUMN birthday DATE NULL AFTER summary,
  ADD COLUMN website VARCHAR(512) NULL AFTER birthday,
  ADD COLUMN open_to VARCHAR(32) NULL AFTER resume_uploaded_at,
  ADD COLUMN profile_language VARCHAR(64) NULL AFTER open_to,
  ADD COLUMN profile_slug VARCHAR(160) NULL AFTER profile_language;
