import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const useSocket = () => {
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [priceUpdates, setPriceUpdates] = useState({});

    // Single shared handler for price updates
    const priceHandler = useCallback((data) => {
        setPriceUpdates((prev) => ({
            ...prev,
            [data.symbol]: data,
        }));
    }, []);

    useEffect(() => {
        const socket = io(SOCKET_URL, {
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

        // Register price update listeners ONCE
        socket.on("price-update", priceHandler);
        socket.on("ticker-update", priceHandler);

        return () => {
            socket.off("price-update", priceHandler);
            socket.off("ticker-update", priceHandler);
            socket.disconnect();
        };
    }, [priceHandler]);

    // Subscribe to a single ticker (no listener stacking)
    const subscribeToTicker = useCallback(
        (symbol) => {
            if (socketRef.current && isConnected) {
                socketRef.current.emit("subscribe-ticker", symbol);
            }
        },
        [isConnected],
    );

    const unsubscribeFromTicker = useCallback(
        (symbol) => {
            if (socketRef.current && isConnected) {
                socketRef.current.emit("unsubscribe-ticker", symbol);
            }
        },
        [isConnected],
    );

    // Subscribe to multiple tickers (no listener stacking)
    const subscribeToWatchlist = useCallback(
        (symbols) => {
            if (socketRef.current && isConnected) {
                socketRef.current.emit("subscribe-watchlist", symbols);
            }
        },
        [isConnected],
    );

    const on = useCallback((event, callback) => {
        if (socketRef.current) socketRef.current.on(event, callback);
    }, []);

    const off = useCallback((event, callback) => {
        if (socketRef.current) socketRef.current.off(event, callback);
    }, []);

    return {
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
