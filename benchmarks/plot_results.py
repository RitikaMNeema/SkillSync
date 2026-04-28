#!/usr/bin/env python3
"""Generate bar charts from JMeter CSV results."""

import argparse
from pathlib import Path
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CONFIGS = ["B", "B+S", "B+S+K", "B+S+K+Other"]
FILES = {
    "B":            ("B_scenario_a.csv",        "B_scenario_b.csv"),
    "B+S":          ("BS_scenario_a.csv",        "BS_scenario_b.csv"),
    "B+S+K":        ("BSK_scenario_a.csv",       "BSK_scenario_b.csv"),
    "B+S+K+Other":  ("BSKOther_scenario_a.csv",  "BSKOther_scenario_b.csv"),
}

SCENARIO_A_LABELS = {"POST /jobs/search", "POST /jobs/get"}
SCENARIO_B_LABELS = {"POST /applications/submit"}


def compute_metrics(path: Path, labels: set) -> dict:
    if not path.exists():
        return {"avg_latency": 0, "throughput": 0, "n": 0, "error_rate": 0}

    df = pd.read_csv(path, low_memory=False, dtype={"responseCode": "string"})
    df = df[df["label"].isin(labels)]
    if df.empty:
        return {"avg_latency": 0, "throughput": 0, "n": 0, "error_rate": 0}
    n = len(df)
    avg_latency = df["elapsed"].mean()
    duration_s = (df["timeStamp"].max() - df["timeStamp"].min()) / 1000
    throughput = n / duration_s if duration_s > 0 else 0
    success = df["success"].astype(str).str.lower().eq("true")
    error_rate = 100.0 * (1.0 - success.mean()) if n else 0.0
    return {
        "avg_latency": avg_latency,
        "throughput": throughput,
        "n": n,
        "error_rate": error_rate,
    }


def bar_chart(values, configs, ylabel, title, out_path):
    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(configs, values, color=["#0077B5", "#00A0DC", "#86888A", "#313335"])
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() * 1.01,
                f"{val:.1f}", ha="center", va="bottom", fontsize=9)
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", default="results")
    args = parser.parse_args()
    results_dir = Path(args.results_dir)

    scen_a = {"latency": [], "throughput": []}
    scen_b = {"latency": [], "throughput": []}

    for cfg in CONFIGS:
        fa, fb = FILES[cfg]
        ma = compute_metrics(results_dir / fa, SCENARIO_A_LABELS)
        mb = compute_metrics(results_dir / fb, SCENARIO_B_LABELS)
        scen_a["latency"].append(ma["avg_latency"])
        scen_a["throughput"].append(ma["throughput"])
        scen_b["latency"].append(mb["avg_latency"])
        scen_b["throughput"].append(mb["throughput"])
        print(
            f"  {cfg:<16} ScenA  latency={ma['avg_latency']:.1f}ms  "
            f"throughput={ma['throughput']:.1f}req/s  err={ma['error_rate']:.2f}%  n={ma['n']}"
        )
        print(
            f"  {cfg:<16} ScenB  latency={mb['avg_latency']:.1f}ms  "
            f"throughput={mb['throughput']:.1f}req/s  err={mb['error_rate']:.2f}%  n={mb['n']}"
        )

    bar_chart(scen_a["latency"],    CONFIGS, "Avg Latency (ms)",  "Scenario A — Avg Latency",    results_dir / "scenario_a_latency.png")
    bar_chart(scen_a["throughput"], CONFIGS, "Throughput (req/s)","Scenario A — Throughput",      results_dir / "scenario_a_throughput.png")
    bar_chart(scen_b["latency"],    CONFIGS, "Avg Latency (ms)",  "Scenario B — Avg Latency",    results_dir / "scenario_b_latency.png")
    bar_chart(scen_b["throughput"], CONFIGS, "Throughput (req/s)","Scenario B — Throughput",      results_dir / "scenario_b_throughput.png")

    for name in ["scenario_a_latency", "scenario_a_throughput", "scenario_b_latency", "scenario_b_throughput"]:
        print(f"  ✓ Saved: {name}.png")
    print("Chart generation complete.")


if __name__ == "__main__":
    main()
