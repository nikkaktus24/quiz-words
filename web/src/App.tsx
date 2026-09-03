import { Navigate, Route, Routes } from "react-router-dom";
import { Welcome } from "./pages/Welcome";
import { Home } from "./pages/Home";
import { DeckPage } from "./pages/DeckPage";
import { StudyPage } from "./pages/StudyPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/home" element={<Home />} />
      <Route path="/decks/:id" element={<DeckPage />} />
      <Route path="/decks/:id/study" element={<StudyPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
