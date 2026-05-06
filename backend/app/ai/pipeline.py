"""Analyzer factory.

A single entry-point that returns the configured analyzer implementation.
Replace `heuristic` with a real model (e.g. `onnx`, `mobilenet`) by
adding a new branch and a new `SkinAnalyzer` subclass.
"""
from __future__ import annotations

from app.ai.base import SkinAnalyzer
from app.ai.heuristic_analyzer import HeuristicSkinAnalyzer
from app.core.config import settings


def get_analyzer() -> SkinAnalyzer:
    name = (settings.ai_analyzer or "heuristic").lower()
    if name == "heuristic":
        return HeuristicSkinAnalyzer()
    raise ValueError(f"Unknown analyzer: {name}")
