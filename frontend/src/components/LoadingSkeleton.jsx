import React from "react";
import GlassCard from "./GlassCard";

/**
 * LoadingSkeleton - Reusable loading skeleton component
 * Use this while data is being fetched
 */
const LoadingSkeleton = ({ type = "card", count = 1, className = "" }) => {
  const renderSkeleton = () => {
    switch (type) {
      case "card":
        return (
          <GlassCard className={`p-6 ${className}`}>
            <div className="animate-shimmer space-y-4">
              <div className="h-6 bg-white/10 rounded w-1/3"></div>
              <div className="h-20 bg-white/10 rounded"></div>
              <div className="h-4 bg-white/10 rounded w-2/3"></div>
            </div>
          </GlassCard>
        );

      case "signal":
        return (
          <GlassCard className={`p-6 ${className}`}>
            <div className="animate-shimmer space-y-4">
              <div className="flex justify-between">
                <div className="h-6 bg-white/10 rounded w-24"></div>
                <div className="h-6 bg-white/10 rounded w-16"></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 bg-white/10 rounded"></div>
                ))}
              </div>
              <div className="h-16 bg-white/10 rounded"></div>
            </div>
          </GlassCard>
        );

      case "widget":
        return (
          <GlassCard className={`p-6 ${className}`}>
            <div className="animate-shimmer space-y-3">
              <div className="h-5 bg-white/10 rounded w-1/2"></div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 bg-white/10 rounded w-20"></div>
                  <div className="h-4 bg-white/10 rounded w-16"></div>
                </div>
              ))}
            </div>
          </GlassCard>
        );

      case "table":
        return (
          <div className={`space-y-3 ${className}`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="animate-shimmer h-12 bg-white/10 rounded-lg"
              ></div>
            ))}
          </div>
        );

      case "chart":
        return (
          <GlassCard className={`p-6 ${className}`}>
            <div className="animate-shimmer space-y-4">
              <div className="h-6 bg-white/10 rounded w-1/4"></div>
              <div className="h-64 bg-white/10 rounded"></div>
            </div>
          </GlassCard>
        );

      case "portfolio":
        return (
          <GlassCard className={`p-6 ${className}`}>
            <div className="animate-shimmer space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 bg-white/10 rounded"></div>
                ))}
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-white/10 rounded"></div>
              ))}
            </div>
          </GlassCard>
        );

      default:
        return (
          <div
            className={`animate-shimmer h-20 bg-white/10 rounded ${className}`}
          ></div>
        );
    }
  };

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>{renderSkeleton()}</div>
      ))}
    </>
  );
};

export default LoadingSkeleton;
