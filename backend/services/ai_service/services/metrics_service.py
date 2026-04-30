from datetime import datetime, timezone
from typing import Any, Dict

from services.in_memory_store import TraceStore


def _seconds_between(start: datetime, end: datetime) -> float:
    return max(0.0, (end - start).total_seconds())


class MetricsService:
    def __init__(self, store: TraceStore) -> None:
        self.store = store

    async def get_metrics(self) -> Dict[str, Any]:
        traces = await self.store.list_traces()

        total_workflows = len(traces)
        if total_workflows == 0:
            return {
                "total_workflows": 0,
                "approval_rate": 0.0,
                "rejection_rate": 0.0,
                "edit_rate": 0.0,
                "completion_rate": 0.0,
                "average_match_score": 0.0,
                "recommendation_quality_score": 0.0,
                "high_fit_approval_rate": 0.0,
                "average_time_to_decision_seconds": 0.0,
                "fit_band_distribution": {
                    "high_fit": 0,
                    "medium_fit": 0,
                    "low_fit": 0,
                },
            }

        completed_count = 0
        decision_count = 0
        approved_count = 0
        rejected_count = 0
        edited_count = 0

        match_scores = []
        high_fit_total = 0
        high_fit_approved = 0
        decision_times = []

        fit_band_distribution = {
            "high_fit": 0,
            "medium_fit": 0,
            "low_fit": 0,
        }

        quality_points = 0.0

        for trace in traces:
            if trace.status == "completed":
                completed_count += 1

            approval_status = trace.approval_status
            final_result = trace.final_result or {}
            match_result = final_result.get("match_result", {})
            outreach_draft = final_result.get("outreach_draft", {})

            match_score = match_result.get("match_score")
            if isinstance(match_score, (int, float)):
                match_scores.append(float(match_score))

            fit_band = outreach_draft.get("fit_band")
            if fit_band in fit_band_distribution:
                fit_band_distribution[fit_band] += 1

            if approval_status in {"approved", "edited_and_approved", "rejected"}:
                decision_count += 1
                decision_times.append(_seconds_between(trace.created_at, trace.updated_at))

            if approval_status == "approved":
                approved_count += 1
                quality_points += 1.0
            elif approval_status == "edited_and_approved":
                approved_count += 1
                edited_count += 1
                quality_points += 0.7
            elif approval_status == "rejected":
                rejected_count += 1
                quality_points += 0.0

            if isinstance(match_score, (int, float)) and float(match_score) >= 70:
                high_fit_total += 1
                if approval_status in {"approved", "edited_and_approved"}:
                    high_fit_approved += 1

        approval_rate = (approved_count / decision_count) if decision_count else 0.0
        rejection_rate = (rejected_count / decision_count) if decision_count else 0.0
        edit_rate = (edited_count / decision_count) if decision_count else 0.0
        completion_rate = completed_count / total_workflows if total_workflows else 0.0
        average_match_score = sum(match_scores) / len(match_scores) if match_scores else 0.0
        recommendation_quality_score = quality_points / decision_count if decision_count else 0.0
        high_fit_approval_rate = (high_fit_approved / high_fit_total) if high_fit_total else 0.0
        average_time_to_decision_seconds = (
            sum(decision_times) / len(decision_times) if decision_times else 0.0
        )

        return {
            "total_workflows": total_workflows,
            "approval_rate": round(approval_rate, 4),
            "rejection_rate": round(rejection_rate, 4),
            "edit_rate": round(edit_rate, 4),
            "completion_rate": round(completion_rate, 4),
            "average_match_score": round(average_match_score, 2),
            "recommendation_quality_score": round(recommendation_quality_score, 4),
            "high_fit_approval_rate": round(high_fit_approval_rate, 4),
            "average_time_to_decision_seconds": round(average_time_to_decision_seconds, 2),
            "fit_band_distribution": fit_band_distribution,
        }