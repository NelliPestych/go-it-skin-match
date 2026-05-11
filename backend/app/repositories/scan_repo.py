from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.skin_scan import SkinScan


class SkinScanRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        user_id: int,
        image_path: str,
        features: Dict[str, Any],
        image_front_path: Optional[str] = None,
        image_left_path: Optional[str] = None,
        image_right_path: Optional[str] = None,
    ) -> SkinScan:
        scan = SkinScan(
            user_id=user_id,
            image_path=image_path,
            image_front_path=image_front_path,
            image_left_path=image_left_path,
            image_right_path=image_right_path,
            features_json=features,
        )
        self.db.add(scan)
        self.db.commit()
        self.db.refresh(scan)
        return scan

    def get(self, scan_id: int) -> Optional[SkinScan]:
        return self.db.get(SkinScan, scan_id)

    def list_for_user(self, user_id: int):
        # id is a stable tiebreaker for inserts sharing the same
        # created_at second (SQLite drops sub-second precision).
        return (
            self.db.query(SkinScan)
            .filter(SkinScan.user_id == user_id)
            .order_by(SkinScan.created_at.desc(), SkinScan.id.desc())
            .all()
        )
