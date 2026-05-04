-- Network score cache (graph metrics). Safe to run multiple times.
-- Does not modify any existing table.

USE linkedin_db;

CREATE TABLE IF NOT EXISTS member_network_scores (
  member_id               BIGINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'users.id (member or recruiter)',
  degree                  INT UNSIGNED NOT NULL DEFAULT 0,
  pagerank_score          DECIMAL(8, 4) NOT NULL DEFAULT 0.0000 COMMENT '0-100 normalized',
  betweenness_score       DECIMAL(12, 8) NOT NULL DEFAULT 0.00000000 COMMENT '0-100 normalized',
  community_id            INT NOT NULL DEFAULT 0,
  network_rank_percentile DECIMAL(6, 3) NOT NULL DEFAULT 0.000 COMMENT '0-100 degree percentile among members',
  computed_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
