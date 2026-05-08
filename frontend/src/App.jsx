import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./MainLayout";
import Dashboard from "./Dashboard";
import ChartsPage from "./ChartsPage";
import ChatPage from "./ChatPage";
import Watchlist from "./Watchlist";
import Signals from "./Signals";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <MainLayout>
              <Dashboard />
            </MainLayout>
          }
        />
        <Route
          path="/charts"
          element={
            <MainLayout>
              <ChartsPage />
            </MainLayout>
          }
        />
        <Route
          path="/ai"
          element={
            <MainLayout>
              <ChatPage />
            </MainLayout>
          }
        />
        <Route
          path="/watchlist"
          element={
            <MainLayout>
              <Watchlist />
            </MainLayout>
          }
        />
        <Route
          path="/signals"
          element={
            <MainLayout>
              <Signals />
            </MainLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
