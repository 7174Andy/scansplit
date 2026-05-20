import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Wizard from "./pages/Wizard";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/transaction/new" element={<Wizard />} />
          <Route path="/transaction/:id" element={<div>Saved transaction view coming in Task 22</div>} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
