import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateBanner } from "./components/UpdateBanner";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Wizard from "./pages/Wizard";
import TransactionView from "./pages/TransactionView";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <UpdateBanner />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/transaction/new" element={<Wizard />} />
          <Route path="/transaction/:id" element={<TransactionView />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
