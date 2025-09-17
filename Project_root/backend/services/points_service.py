from typing import Optional


def compute_points(score: Optional[float], accept_threshold: float = 0.3, max_points: int = 100) -> int:
    """Map a similarity score [0,1] to a points value [0, max_points].
    - < accept_threshold -> 0 points
    - >= accept_threshold -> linear scale up to max_points
    """
    try:
        s = float(score * 2)
    except (TypeError, ValueError):
        return 0
    if s < accept_threshold:
        return 0
    # Normalize to [0,1] above the threshold
    norm = (s - accept_threshold) / (1 - accept_threshold)
    norm = max(0.0, min(1.0, norm))
    return int(round(max_points * norm))
