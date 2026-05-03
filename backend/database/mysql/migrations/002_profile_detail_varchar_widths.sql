-- Widen profile detail columns on older volumes so parsed résumés fit.
-- Docker Compose exposes MySQL on host port 3310 (see docker-compose.yml: "3310:3306").
-- Example:
--   mysql -h 127.0.0.1 -P 3310 -u linkedin_user -p linkedin_db < backend/database/mysql/migrations/002_profile_detail_varchar_widths.sql

ALTER TABLE experience
  MODIFY title VARCHAR(255) NOT NULL,
  MODIFY employment_type VARCHAR(100) NULL,
  MODIFY company VARCHAR(255) NOT NULL,
  MODIFY start_month VARCHAR(20) NULL,
  MODIFY end_month VARCHAR(20) NULL,
  MODIFY location VARCHAR(255) NULL,
  MODIFY location_type VARCHAR(100) NULL;

ALTER TABLE education
  MODIFY school VARCHAR(255) NOT NULL,
  MODIFY degree VARCHAR(255) NULL,
  MODIFY field_of_study VARCHAR(255) NULL,
  MODIFY start_month VARCHAR(20) NULL,
  MODIFY end_month VARCHAR(20) NULL,
  MODIFY grade VARCHAR(80) NULL;

ALTER TABLE skills MODIFY skill_name VARCHAR(255) NOT NULL;
ALTER TABLE member_skill_mappings MODIFY skill_name VARCHAR(255) NOT NULL;
