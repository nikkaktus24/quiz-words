import { Navigate, Route, Routes } from "react-router-dom";
import { Welcome } from "./pages/Welcome";
import { Home } from "./pages/Home";
import { DeckPage } from "./pages/DeckPage";
import { StudyPage } from "./pages/StudyPage";
import { FlashcardsPage } from "./pages/FlashcardsPage";
import { LearnPage } from "./pages/LearnPage";
import { TestPage } from "./pages/TestPage";
import { RulePage } from "./pages/RulePage";
import { RuleLearnPage } from "./pages/RuleLearnPage";
import { RuleTestPage } from "./pages/RuleTestPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/home" element={<Home />} />
      <Route path="/decks/:id" element={<DeckPage />} />
      <Route path="/decks/:id/cards" element={<FlashcardsPage />} />
      <Route path="/decks/:id/flashcards" element={<FlashcardsPage />} />
      <Route path="/decks/:id/learn" element={<LearnPage />} />
      <Route path="/decks/:id/test" element={<TestPage />} />
      <Route path="/decks/:id/study" element={<StudyPage />} />
      <Route path="/review/cards" element={<FlashcardsPage />} />
      <Route path="/review/learn" element={<LearnPage />} />
      <Route path="/review/test" element={<TestPage />} />
      <Route path="/rules/:id" element={<RulePage />} />
      <Route path="/rules/:id/learn" element={<RuleLearnPage />} />
      <Route path="/rules/:id/test" element={<RuleTestPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
