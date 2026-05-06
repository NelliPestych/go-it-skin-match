from typing import Iterable, List

from sqlalchemy.orm import Session

from app.models.recommendation import Recommendation


class RecommendationRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_for_analysis(self, analysis_id: int) -> List[Recommendation]:
        return (
            self.db.query(Recommendation)
            .filter(Recommendation.analysis_id == analysis_id)
            .order_by(Recommendation.score.desc())
            .all()
        )

    def replace_for_analysis(
        self,
        user_id: int,
        analysis_id: int,
        items: Iterable[dict],
    ) -> List[Recommendation]:
        self.db.query(Recommendation).filter(
            Recommendation.analysis_id == analysis_id
        ).delete(synchronize_session=False)

        records = [
            Recommendation(
                user_id=user_id,
                analysis_id=analysis_id,
                product_id=item["product_id"],
                score=item["score"],
                reason_json={"reasons": item["reasons"]},
            )
            for item in items
        ]
        self.db.add_all(records)
        self.db.commit()
        for record in records:
            self.db.refresh(record)
        return records
