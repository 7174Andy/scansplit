import React from "react";
import ReactDOM from "react-dom/client";
import { SharePage } from "./SharePage";
import "../globals.css";

// Deliberately minimal: no router, no ErrorBoundary, no UpdateBanner. Anything
// from src/App.tsx would drag in @tauri-apps/plugin-updater, which cannot load
// in a browser.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SharePage fragment={window.location.hash.replace(/^#/, "")} />
  </React.StrictMode>
);
