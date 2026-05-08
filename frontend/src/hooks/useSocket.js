import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

export const useSocket = () => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [priceUpdates, setPriceUpdates] = useState({});

  useEffect(() => {
    // Initialize Socket.IO connection
    const socket = io("http://localhost:5000", {
      transports: ["websocket"],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket.IO connected:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Socket.IO disconnected");
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
    });

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Subscribe to a single ticker
  const subscribeToTicker = useCallback(
    (symbol) => {
      if (socketRef.current && isConnected) {
        socketRef.current.emit("subscribe-ticker", symbol);

        // Listen for price updates for this symbol
        socketRef.current.on(`price-update`, (data) => {
          if (data.symbol === symbol) {
            setPriceUpdates((prev) => ({
              ...prev,
              [symbol]: data,
            }));
          }
        });
      }
    },
    [isConnected],
  );

  // Unsubscribe from a ticker
  const unsubscribeFromTicker = useCallback(
    (symbol) => {
      if (socketRef.current && isConnected) {
        socketRef.current.emit("unsubscribe-ticker", symbol);
      }
    },
    [isConnected],
  );

  // Subscribe to multiple tickers (for watchlist)
  const subscribeToWatchlist = useCallback(
    (symbols) => {
      if (socketRef.current && isConnected) {
        socketRef.current.emit("subscribe-watchlist", symbols);

        // Listen for all ticker updates
        socketRef.current.on("ticker-update", (data) => {
          setPriceUpdates((prev) => ({
            ...prev,
            [data.symbol]: data,
          }));
        });
      }
    },
    [isConnected],
  );

  // Generic event listener
  const on = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  }, []);

  // Remove event listener
  const off = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    priceUpdates,
    subscribeToTicker,
    unsubscribeFromTicker,
    subscribeToWatchlist,
    on,
    off,
  };
};

export default useSocket;
