import { Navigate, Route, Routes } from "react-router-dom";

import HomePage from "./pages/HomePage";
import CapturePage from "./pages/CapturePage";
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
          <Route path="/capture" element={<CapturePage />} />
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
