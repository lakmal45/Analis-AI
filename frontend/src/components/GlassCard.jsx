import { memo } from "react";

const GlassCard = memo(({ children, className = "", hover = true, ...props }) => {
  return (
    <div
      className={`
        bg-[#141929] border border-white/[0.08]
        rounded-xl shadow-lg
        ${hover ? "hover:bg-[#1a2035] hover:border-white/[0.12] transition-colors duration-200" : ""}
        ${className}
      `}
      style={{ contain: "layout style paint" }}
      {...props}
    >
      {children}
    </div>
  );
});

export default GlassCard;
