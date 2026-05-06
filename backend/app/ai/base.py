"""Skin analyzer interface.

The interface deliberately accepts raw bytes and returns a typed Pydantic
schema, so any future implementation — heuristic, ONNX-runtime, PyTorch,
or a remote inference endpoint — can be plugged in without touching the
service layer.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.analysis import SkinFeatures


class SkinAnalyzer(ABC):
    @abstractmethod
    def analyze(self, image_bytes: bytes) -> SkinFeatures:
        """Run analysis on a raw image and return structured skin features."""
