import React from "react";
import ReactDOM from "react-dom/client";
import { SharePage } from "./SharePage";
import { ShareErrorBoundary } from "./ShareErrorBoundary";
import "../globals.css";

// Deliberately minimal: no router, no UpdateBanner, and nothing from
// src/App.tsx, which would drag in @tauri-apps/plugin-updater — that cannot
// load in a browser. src/share/no-tauri.test.ts enforces this.
//
// The boundary is local to src/share/ for the same reason: it catches a render
// throw on a fragment the decoder accepted, so the recipient gets the shell and
// its download link instead of a blank page.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShareErrorBoundary>
      <SharePage fragment={window.location.hash.replace(/^#/, "")} />
    </ShareErrorBoundary>
  </React.StrictMode>
);
