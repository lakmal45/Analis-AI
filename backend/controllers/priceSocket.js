module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("Client connected", socket.id);
    socket.emit("connected", { msg: "welcome" });
  });

  const fetchPrices = async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
      );
      const data = await res.json();
      io.emit("prices", { source: "coingecko", data, ts: Date.now() });
    } catch (err) {
      console.error("Price fetch error", err);
    }
  };

  fetchPrices();
  setInterval(fetchPrices, 5000);
};
