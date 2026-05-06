from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.quiz_answer import QuizAnswer


class QuizRepository:
    def __init__(self, db: Session):
        self.db = db

    def upsert(self, user_id: int, analysis_id: int, answers: Dict[str, Any]) -> QuizAnswer:
        existing = (
            self.db.query(QuizAnswer)
            .filter(QuizAnswer.analysis_id == analysis_id)
            .first()
        )
        if existing:
            existing.answers_json = answers
            self.db.commit()
            self.db.refresh(existing)
            return existing
        record = QuizAnswer(user_id=user_id, analysis_id=analysis_id, answers_json=answers)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_by_analysis(self, analysis_id: int) -> Optional[QuizAnswer]:
        return (
            self.db.query(QuizAnswer)
            .filter(QuizAnswer.analysis_id == analysis_id)
            .first()
        )
