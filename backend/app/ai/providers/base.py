"""Skin analysis provider interface.

A provider is a *higher-level* abstraction than `SkinAnalyzer`:

* `SkinAnalyzer` answers "given image bytes, what are six numerical
  features?" — local-only, sync, single-image.
* `SkinAnalysisProvider` answers "given a Smart Camera shoot (front
  + optional left / right), give me one normalized result with
  provider provenance" — works with remote AI vendors, multi-image
  inputs, and provider metadata (name, confidence, raw summary).

The provider stays **sync** for now — there is no remote call yet.
When the real Haut.AI provider lands we'll either move to
`async def analyze(...)` or wrap the HTTP call in a thread-pool —
the choice is deferred until we know the API contract.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar, Optional

from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


class SkinAnalysisProvider(ABC):
    """Provider contract.

    Subclasses MUST set a stable `name` (used for persistence + env
    routing) and implement `analyze()`.  Multi-image inputs are
    *optional* on the interface — providers that only consume the
    front shot may ignore `left` / `right`.  The bytes are still
    persisted by the service layer so future providers can pick
    them up without re-uploading.
    """

    name: ClassVar[str]

    @abstractmethod
    def analyze(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> NormalizedSkinAnalysisResult:
        """Run skin analysis on one or more poses."""
