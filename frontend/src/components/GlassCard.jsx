const GlassCard = ({ children, className = "", hover = true, ...props }) => {
  return (
    <div
      className={`
        bg-white/10 backdrop-blur-lg
        border border-white/20
        rounded-xl shadow-xl
        ${hover ? "hover:bg-white/15 hover:shadow-2xl transition-all duration-300" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export default GlassCard;
