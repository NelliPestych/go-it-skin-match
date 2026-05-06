from sqlalchemy.orm import Session

from app.models.quiz_answer import QuizAnswer
from app.repositories.quiz_repo import QuizRepository
from app.schemas.quiz import QuizSubmission


class QuizService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = QuizRepository(db)

    def submit(self, user_id: int, payload: QuizSubmission) -> QuizAnswer:
        return self.repo.upsert(
            user_id=user_id,
            analysis_id=payload.analysis_id,
            answers=payload.model_dump(mode="json", exclude={"analysis_id"}),
        )
