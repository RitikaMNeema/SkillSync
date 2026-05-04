-- Idempotent: drop fk_mns_member only if it exists (older installs had FK to members only).

USE linkedin_db;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'member_network_scores'
    AND CONSTRAINT_NAME = 'fk_mns_member'
);
SET @sqlstmt := IF(@exist > 0, 'ALTER TABLE member_network_scores DROP FOREIGN KEY fk_mns_member', 'SELECT 1');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
