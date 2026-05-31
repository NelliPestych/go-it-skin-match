import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import HomePage from "./pages/HomePage";
// `pages/CapturePage.tsx` is intentionally kept on disk as a fallback
// component (per plan #3) but is no longer mounted: /capture now
// serves SmartCameraIntroPage, which inlines the manual-upload picker.
//
// `pages/QuizSkinTypePage.tsx` and `pages/QuizConcernsPage.tsx` are
// the legacy 2-question quiz pages.  They are kept on disk for safety
// (per the Step 2 constraint "do not delete old quiz pages yet") but
// are no longer routed: the config-driven `QuizPage` mounted on
// `/quiz/:step` supersedes them, and `/quiz/skin-type` /
// `/quiz/concerns` are mapped to redirects so deep-links keep working.
import SmartCameraIntroPage from "./pages/SmartCameraIntroPage";
import SmartCameraPage from "./pages/SmartCameraPage";
import QuizPage from "./pages/QuizPage";
import AnalyzingPage from "./pages/AnalyzingPage";
import ResultsPage from "./pages/ResultsPage";
import HistoryPage from "./pages/HistoryPage";
import { FlowProvider } from "./state/flow";

/** Reset window scroll on every route change (Router v6 doesn't). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <FlowProvider>
      <ScrollToTop />
      <div className="mobile-frame">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/capture" element={<SmartCameraIntroPage />} />
          <Route path="/smart-camera" element={<SmartCameraPage />} />
          {/* New config-driven 7-step quiz. */}
          <Route path="/quiz" element={<Navigate to="/quiz/1" replace />} />
          <Route path="/quiz/:step" element={<QuizPage />} />
          {/* Legacy deep-links from earlier versions of the app fall
              through to the new quiz at the appropriate step. */}
          <Route
            path="/quiz/skin-type"
            element={<Navigate to="/quiz/1" replace />}
          />
          <Route
            path="/quiz/concerns"
            element={<Navigate to="/quiz/2" replace />}
          />
          <Route path="/analyzing" element={<AnalyzingPage />} />
          <Route path="/results/:analysisId" element={<ResultsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </FlowProvider>
  );
}
