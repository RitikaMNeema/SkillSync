#!/usr/bin/env bash
# run_benchmarks.sh — runs all four performance configurations for SkillSync
set -euo pipefail

JMETER_HOME="${JMETER_HOME:-}"
JMETER="${JMETER_HOME:+$JMETER_HOME/bin/}jmeter"

AUTH_HOST="localhost";  AUTH_PORT="3001"
JOB_HOST="localhost";   JOB_PORT="3005"
APP_HOST="localhost";   APP_PORT="3006"
REDIS_HOST="localhost"; REDIS_PORT="6380"

TEST_EMAIL="jmtest_reader@jmtest.dev"
TEST_PASS='JMeter123!'

THREADS="${THREADS:-100}"
RAMP_UP="${RAMP_UP:-30}"
DURATION_A="${DURATION_A:-60}"
DURATION_B="${DURATION_B:-60}"
JOB_ID_START="${JOB_ID_START:-605}"
JOB_ID_END="${JOB_ID_END:-804}"
SCEN_B_DUP_PCT="${SCEN_B_DUP_PCT:-10}"
SCEN_B_DELAY_MS="${SCEN_B_DELAY_MS:-200}"

RESULTS_DIR="$(dirname "$0")/results"
mkdir -p "$RESULTS_DIR"

# Keep each benchmark run isolated so charts do not aggregate stale CSV rows.
rm -f "$RESULTS_DIR"/*.csv "$RESULTS_DIR"/*.png

COMPOSE_FILE="$(dirname "$0")/../backend/docker-compose.yml"
JOB_CONTAINER_NAME="linkedin_job"
JOB_CACHE_REDIS_HOST_OFF="invalid-cache-host"
JOB_CACHE_WAS_DISABLED=0

JMX_A="$(dirname "$0")/scenario_a.jmx"
JMX_B="$(dirname "$0")/scenario_b.jmx"

run_jmeter() {
    local jmx="$1" out="$2" label="$3"
    shift 3
    echo "  → Running JMeter: $label"
    "$JMETER" -n \
        -f \
        -t "$jmx" \
        -l "$out" \
        -Jauth_host="$AUTH_HOST" -Jauth_port="$AUTH_PORT" \
        -Jjob_host="$JOB_HOST"   -Jjob_port="$JOB_PORT" \
        -Japp_host="$APP_HOST"   -Japp_port="$APP_PORT" \
        -Jtest_email="$TEST_EMAIL" -Jtest_pass="$TEST_PASS" \
        -Jthreads="$THREADS"    -Jramp_up="$RAMP_UP" \
        -Jjob_id_start="$JOB_ID_START" -Jjob_id_end="$JOB_ID_END" \
        -Jdup_pct="$SCEN_B_DUP_PCT" -Jsubmit_delay_ms="$SCEN_B_DELAY_MS" \
        -Jresults_file="$out"   \
        "$@"
    echo "  ✓ Saved → $out"
}

wait_for_job_service_healthy() {
    local attempts=0
    local max_attempts=60
    while (( attempts < max_attempts )); do
        local status
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$JOB_CONTAINER_NAME" 2>/dev/null || true)"
        if [[ "$status" == "healthy" || "$status" == "running" ]]; then
            return 0
        fi
        attempts=$((attempts + 1))
        sleep 2
    done
    echo "  ! Timed out waiting for $JOB_CONTAINER_NAME to become healthy"
    return 1
}

set_job_service_cache_mode() {
    local mode="$1" # on|off
    if [[ "$mode" == "off" ]]; then
        echo "  Recreating job-service with Redis disabled (true baseline mode) …"
        local override_file
        override_file="$(mktemp)"
        cat > "$override_file" <<EOF
services:
  job-service:
    environment:
      REDIS_HOST: ${JOB_CACHE_REDIS_HOST_OFF}
EOF
        docker compose -f "$COMPOSE_FILE" -f "$override_file" up -d --no-deps --force-recreate job-service
        rm -f "$override_file"
        JOB_CACHE_WAS_DISABLED=1
    else
        echo "  Recreating job-service with normal Redis config …"
        docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate job-service
        JOB_CACHE_WAS_DISABLED=0
    fi
    wait_for_job_service_healthy
}

restore_job_service_cache_on_exit() {
    if [[ "$JOB_CACHE_WAS_DISABLED" == "1" ]]; then
        echo ""
        echo "[ Cleanup ] Restoring normal job-service cache configuration …"
        docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate job-service > /dev/null 2>&1 || true
    fi
}

trap restore_job_service_cache_on_exit EXIT

flush_redis() {
    echo "  Flushing Redis cache ($REDIS_HOST:$REDIS_PORT) …"
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHALL > /dev/null
    echo "  ✓ Redis flushed"
}

warm_redis() {
    echo "  Warming Redis cache (30s warm-up pass) …"
    "$JMETER" -n \
        -t "$JMX_A" \
        -l /dev/null \
        -Jauth_host="$AUTH_HOST" -Jauth_port="$AUTH_PORT" \
        -Jjob_host="$JOB_HOST"   -Jjob_port="$JOB_PORT" \
        -Jtest_email="$TEST_EMAIL" -Jtest_pass="$TEST_PASS" \
        -Jthreads=10 -Jramp_up=5 -Jduration=30 \
        -Jresults_file=/dev/null \
        2>/dev/null
    echo "  ✓ Cache warmed"
}

reset_benchmark_applications() {
    echo "  Resetting benchmark applications (jmtest users) …"
    if docker exec -i linkedin_mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" linkedin_db' >/dev/null 2>&1 <<'SQL'
DELETE an
FROM application_notes an
JOIN applications a ON a.application_id = an.application_id
JOIN users u ON u.id = a.member_id
WHERE u.email LIKE 'jmtest_%@jmtest.dev'
   OR u.email = 'jmtest_reader@jmtest.dev';

DELETE a
FROM applications a
JOIN users u ON u.id = a.member_id
WHERE u.email LIKE 'jmtest_%@jmtest.dev'
   OR u.email = 'jmtest_reader@jmtest.dev';

UPDATE jobs j
LEFT JOIN (
    SELECT job_id, COUNT(*) AS c
    FROM applications
    GROUP BY job_id
) agg ON agg.job_id = j.job_id
SET j.applicants_count = COALESCE(agg.c, 0);
SQL
    then
        echo "  ✓ Benchmark applications reset"
    else
        echo "  ! Could not reset benchmark applications automatically"
        echo "    (continuing; Scenario B may contain duplicate-application conflicts)"
    fi
}

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SkillSync JMeter Benchmark Suite"
echo "  Threads=$THREADS  RampUp=${RAMP_UP}s"
echo "  Scenario B Duration=${DURATION_B}s"
echo "  Scenario B Job IDs=${JOB_ID_START}-${JOB_ID_END}"
echo "  Scenario B Mix: ${SCEN_B_DUP_PCT}% duplicate target, ${SCEN_B_DELAY_MS}ms think time"
echo "  Results → $RESULTS_DIR"
echo "════════════════════════════════════════════════════════"
echo ""

echo "[ Config B — Baseline: no Redis cache ]"
set_job_service_cache_mode off
flush_redis
run_jmeter "$JMX_A" "$RESULTS_DIR/B_scenario_a.csv" "Config B / Scenario A" \
    -Jduration="$DURATION_A"
sleep 5
flush_redis
reset_benchmark_applications
run_jmeter "$JMX_B" "$RESULTS_DIR/B_scenario_b.csv" "Config B / Scenario B" \
    -Jduration="$DURATION_B"
echo ""

echo "[ Config B+S — Add Redis SQL caching ]"
set_job_service_cache_mode on
warm_redis
run_jmeter "$JMX_A" "$RESULTS_DIR/BS_scenario_a.csv" "Config B+S / Scenario A" \
    -Jduration="$DURATION_A"
sleep 5
reset_benchmark_applications
run_jmeter "$JMX_B" "$RESULTS_DIR/BS_scenario_b.csv" "Config B+S / Scenario B" \
    -Jduration="$DURATION_B"
echo ""

echo "[ Config B+S+K — Add Kafka async events ]"
warm_redis
run_jmeter "$JMX_A" "$RESULTS_DIR/BSK_scenario_a.csv" "Config B+S+K / Scenario A" \
    -Jduration="$DURATION_A"
sleep 5
reset_benchmark_applications
run_jmeter "$JMX_B" "$RESULTS_DIR/BSK_scenario_b.csv" "Config B+S+K / Scenario B" \
    -Jduration="$DURATION_B"
echo ""

echo "[ Config B+S+K+Other — Full optimized stack ]"
warm_redis
run_jmeter "$JMX_A" "$RESULTS_DIR/BSKOther_scenario_a.csv" "Config B+S+K+Other / Scenario A" \
    -Jduration="$DURATION_A"
sleep 5
reset_benchmark_applications
run_jmeter "$JMX_B" "$RESULTS_DIR/BSKOther_scenario_b.csv" "Config B+S+K+Other / Scenario B" \
    -Jduration="$DURATION_B"
echo ""

echo "[ Generating performance charts ]"
python3 "$(dirname "$0")/plot_results.py" --results-dir "$RESULTS_DIR"
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Done! Charts saved to $RESULTS_DIR/"
echo "════════════════════════════════════════════════════════"
