from enum import Enum


class SkinType(str, Enum):
    DRY = "dry"
    OILY = "oily"
    COMBINATION = "combination"
    NORMAL = "normal"


class Level(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Concern(str, Enum):
    REDNESS = "redness"
    PIGMENTATION = "pigmentation"
    HYDRATION = "hydration"
    PORES = "pores"
    OILINESS = "oiliness"
    SENSITIVITY = "sensitivity"
