const Signals = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Trading Signals</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Signal Card - Buy */}
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-green-600/50">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="inline-block px-3 py-1 bg-green-600/20 text-green-400 rounded-full text-sm font-medium">
                BUY
              </span>
              <h3 className="text-xl font-bold mt-2">BTC/USDT</h3>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Confidence</p>
              <p className="text-2xl font-bold text-green-400">85%</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Entry Price</span>
              <span className="font-medium">$64,200</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Take Profit</span>
              <span className="font-medium text-green-400">$67,500</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stop Loss</span>
              <span className="font-medium text-red-400">$62,000</span>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-300">
            RSI oversold, MACD bullish crossover, strong support level
          </p>
        </div>

        {/* Signal Card - Sell */}
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-red-600/50">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="inline-block px-3 py-1 bg-red-600/20 text-red-400 rounded-full text-sm font-medium">
                SELL
              </span>
              <h3 className="text-xl font-bold mt-2">ETH/USDT</h3>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Confidence</p>
              <p className="text-2xl font-bold text-red-400">72%</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Entry Price</span>
              <span className="font-medium">$3,450</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Take Profit</span>
              <span className="font-medium text-green-400">$3,200</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stop Loss</span>
              <span className="font-medium text-red-400">$3,600</span>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-300">
            Resistance level reached, bearish divergence on RSI
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signals;
