import { Navigate, Route, Routes } from "react-router-dom";

import HomePage from "./pages/HomePage";
// `pages/CapturePage.tsx` is intentionally kept on disk as a fallback
// component (per plan #3) but is no longer mounted: /capture now
// serves SmartCameraIntroPage, which inlines the manual-upload picker.
import SmartCameraIntroPage from "./pages/SmartCameraIntroPage";
import SmartCameraPage from "./pages/SmartCameraPage";
import QuizSkinTypePage from "./pages/QuizSkinTypePage";
import QuizConcernsPage from "./pages/QuizConcernsPage";
import AnalyzingPage from "./pages/AnalyzingPage";
import ResultsPage from "./pages/ResultsPage";
import HistoryPage from "./pages/HistoryPage";
import { FlowProvider } from "./state/flow";

export default function App() {
  return (
    <FlowProvider>
      <div className="mobile-frame">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/capture" element={<SmartCameraIntroPage />} />
          <Route path="/smart-camera" element={<SmartCameraPage />} />
          <Route path="/quiz/skin-type" element={<QuizSkinTypePage />} />
          <Route path="/quiz/concerns" element={<QuizConcernsPage />} />
          <Route path="/analyzing" element={<AnalyzingPage />} />
          <Route path="/results/:analysisId" element={<ResultsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </FlowProvider>
  );
}
