"""Lorentzian KNN classifier for ensemble predictions.

Uses Lorentzian distance metric (d = Σ log(1 + |xᵢ − yᵢ|)) instead of
Euclidean distance. This reduces the impact of outliers caused by
Black Swan events and FOMC meetings in financial time series.

Based on the Machine Learning: Lorentzian Classification by @jdehorty.
"""

from __future__ import annotations

import numpy as np
from sklearn.neighbors import KNeighborsClassifier


def lorentzian_metric(x: np.ndarray, y: np.ndarray) -> float:
    """Custom Lorentzian distance for sklearn KNN.

    d(x, y) = Σ log(1 + |xᵢ − yᵢ|)

    Properties:
    - Compresses large differences via log(), reducing outlier influence.
    - More robust than Euclidean for non-stationary financial data.
    - Converges to Euclidean-like behavior for small differences.
    """
    return float(np.sum(np.log1p(np.abs(x - y))))


def build_lorentzian_knn(n_neighbors: int = 8) -> KNeighborsClassifier:
    """Build a KNN classifier with Lorentzian distance metric.

    Args:
        n_neighbors: Number of nearest neighbors (default: 8, matching
                     the original PineScript indicator's default).

    Returns:
        A configured KNeighborsClassifier ready for .fit().
    """
    return KNeighborsClassifier(
        n_neighbors=n_neighbors,
        metric=lorentzian_metric,
        weights="distance",  # closer neighbors weighted more
        algorithm="brute",   # required for custom distance metrics
    )
