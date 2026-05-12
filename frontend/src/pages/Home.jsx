import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";

const Home = () => {
  const { user } = useAuth();
  const [isVisible] = useState(true);
  const [activeFeature, setActiveFeature] = useState(0);
  const [chartBars] = useState(() =>
    Array.from(
      { length: 40 },
      (_, i) => 20 + Math.sin(i * 0.3) * 15 + ((i * 17) % 30),
    ),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 4);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: (
        <svg
          className="w-7 h-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
      title: "Real-Time Analytics",
      desc: "Live market data streaming with advanced charting tools and technical indicators.",
    },
    {
      icon: (
        <svg
          className="w-7 h-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      ),
      title: "AI-Powered Signals",
      desc: "Machine learning algorithms analyzing patterns to generate high-confidence trade signals.",
    },
    {
      icon: (
        <svg
          className="w-7 h-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
      title: "Portfolio Security",
      desc: "Enterprise-grade encryption and risk management tools to protect your assets.",
    },
    {
      icon: (
        <svg
          className="w-7 h-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
      title: "AI Chat Assistant",
      desc: "Ask our AI anything about markets, strategies, or portfolio optimization.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/[0.07] blur-[120px] animate-pulse" />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/[0.07] blur-[120px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-cyan-500/[0.05] blur-[100px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <nav className="relative z-50 flex items-center justify-between px-6 md:px-12 lg:px-20 py-5 border-b border-white/[0.06] backdrop-blur-md bg-[#0a0e1a]/60">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-bold text-sm tracking-tight shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
            A
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            AnalisAI
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              to="/app/dashboard"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold hover:from-blue-500 hover:to-violet-500 transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:text-white border border-white/10 hover:border-white/25 hover:bg-white/[0.04] transition-all"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold hover:from-blue-500 hover:to-violet-500 transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="relative z-10 px-6 md:px-12 lg:px-20 pt-20 md:pt-28 pb-16">
        <div className="max-w-5xl mx-auto text-center">
          <div
            className={`transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-8 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Market Intelligence
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight mb-6">
              Trade Smarter with{" "}
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                AI-Powered
              </span>{" "}
              Insights
            </h1>
            <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Harness the power of artificial intelligence to analyze crypto
              markets in real-time. Get actionable signals, manage your
              portfolio, and stay ahead of the market.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to={user ? "/app/dashboard" : "/register"}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold hover:from-blue-500 hover:to-violet-500 transition-all shadow-xl shadow-blue-600/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
              >
                {user ? "Go to Dashboard" : "Start Free Trial"}
              </Link>
              <a
                href="#features"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm font-medium text-gray-300 border border-white/10 hover:border-white/25 hover:bg-white/[0.04] transition-all hover:-translate-y-0.5"
              >
                Explore Features
              </a>
            </div>
          </div>

          <div
            className={`mt-16 relative transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
          >
            <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-1 shadow-2xl shadow-black/40">
              <div className="rounded-xl bg-[#0d1225] p-4 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-3 text-xs text-gray-500">
                    AnalisAI Dashboard
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    {
                      label: "BTC/USDT",
                      value: "$67,842",
                      change: "+2.4%",
                      up: true,
                    },
                    {
                      label: "ETH/USDT",
                      value: "$3,521",
                      change: "+1.8%",
                      up: true,
                    },
                    {
                      label: "SOL/USDT",
                      value: "$142.30",
                      change: "-0.6%",
                      up: false,
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3"
                    >
                      <div className="text-[10px] text-gray-500 mb-1">
                        {c.label}
                      </div>
                      <div className="text-sm font-bold">{c.value}</div>
                      <div
                        className={`text-xs font-medium ${c.up ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {c.change}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="h-32 md:h-48 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-end p-4 gap-1 overflow-hidden">
                  {chartBars.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gradient-to-t from-blue-600/60 to-violet-500/40 transition-all hover:from-blue-500 hover:to-violet-400"
                      style={{ height: `${h}%`, animationDelay: `${i * 30}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-blue-600/10 via-violet-600/10 to-cyan-600/10 blur-2xl -z-10" />
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 md:px-12 lg:px-20 py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Live Market Coverage",
              body: "Track core crypto pairs with streaming price data, chart overlays, and indicator-driven analysis views.",
            },
            {
              title: "AI-Assisted Decisions",
              body: "Blend technical signals, market context, and AI explanations into a faster research workflow.",
            },
            {
              title: "Built for Execution",
              body: "Move from watchlists to signals, portfolio tracking, and actionable dashboards inside one workspace.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
            >
              <div className="text-lg font-bold text-white mb-2">
                {item.title}
              </div>
              <div className="text-sm text-gray-400 leading-relaxed">
                {item.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="features"
        className="relative z-10 px-6 md:px-12 lg:px-20 py-20"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
              Everything You Need to{" "}
              <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
                Dominate
              </span>{" "}
              the Market
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Our platform combines cutting-edge AI with real-time data to give
              you an unfair advantage.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <div
                key={i}
                onMouseEnter={() => setActiveFeature(i)}
                className={`group relative p-6 rounded-2xl border transition-all duration-500 cursor-default ${
                  activeFeature === i
                    ? "bg-gradient-to-br from-blue-600/10 to-violet-600/10 border-blue-500/30 shadow-lg shadow-blue-500/10"
                    : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12]"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-500 ${
                    activeFeature === i
                      ? "bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/30"
                      : "bg-white/[0.06] text-gray-400 group-hover:text-white"
                  }`}
                >
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 md:px-12 lg:px-20 py-20">
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="absolute -inset-10 rounded-3xl bg-gradient-to-r from-blue-600/10 via-violet-600/10 to-cyan-600/10 blur-3xl -z-10" />
          <div className="p-10 md:p-14 rounded-3xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
              Ready to Start Trading Smarter?
            </h2>
            <p className="text-gray-400 mb-8 max-w-lg mx-auto">
              Join thousands of traders who are already using AnalisAI to make
              data-driven decisions.
            </p>
            <Link
              to={user ? "/app/dashboard" : "/register"}
              className="inline-block px-10 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold hover:from-blue-500 hover:to-violet-500 transition-all shadow-xl shadow-blue-600/25 hover:shadow-blue-500/40 hover:-translate-y-1"
            >
              {user ? "Go to Dashboard" : "Get Started - It's Free"}
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 px-6 md:px-12 lg:px-20 py-8 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-bold text-[10px]">
              A
            </div>
            <span>© 2026 AnalisAI. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
