from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.routine_plan import RoutinePlan


class PlanRepository:
    def __init__(self, db: Session):
        self.db = db

    def upsert(self, user_id: int, analysis_id: int, plan: Dict[str, Any]) -> RoutinePlan:
        existing = (
            self.db.query(RoutinePlan)
            .filter(RoutinePlan.analysis_id == analysis_id)
            .first()
        )
        if existing:
            existing.plan_json = plan
            self.db.commit()
            self.db.refresh(existing)
            return existing
        record = RoutinePlan(user_id=user_id, analysis_id=analysis_id, plan_json=plan)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_by_analysis(self, analysis_id: int) -> Optional[RoutinePlan]:
        return (
            self.db.query(RoutinePlan)
            .filter(RoutinePlan.analysis_id == analysis_id)
            .first()
        )
