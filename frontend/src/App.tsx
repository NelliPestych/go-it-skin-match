import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import SmartCameraIntroPage from "./pages/SmartCameraIntroPage";
import SmartCameraPage from "./pages/SmartCameraPage";
import QuizPage from "./pages/QuizPage";
import AnalyzingPage from "./pages/AnalyzingPage";
import ResultsPage from "./pages/ResultsPage";
import HistoryPage from "./pages/HistoryPage";
import RequireAuth from "./components/RequireAuth";
import { AuthProvider } from "./state/auth";
import { FlowProvider } from "./state/flow";

/** Router v6 doesn't reset scroll on route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <FlowProvider>
        <ScrollToTop />
        <div className="mobile-frame">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/capture" element={<SmartCameraIntroPage />} />
            <Route path="/smart-camera" element={<SmartCameraPage />} />
            <Route path="/quiz" element={<Navigate to="/quiz/1" replace />} />
            <Route path="/quiz/:step" element={<QuizPage />} />
            <Route
              path="/quiz/skin-type"
              element={<Navigate to="/quiz/1" replace />}
            />
            <Route
              path="/quiz/concerns"
              element={<Navigate to="/quiz/2" replace />}
            />
            <Route
              path="/analyzing"
              element={
                <RequireAuth>
                  <AnalyzingPage />
                </RequireAuth>
              }
            />
            <Route
              path="/results/:analysisId"
              element={
                <RequireAuth>
                  <ResultsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/history"
              element={
                <RequireAuth>
                  <HistoryPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </FlowProvider>
    </AuthProvider>
  );
}
