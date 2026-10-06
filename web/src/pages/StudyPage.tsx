import { Navigate, useParams, useSearchParams } from "react-router-dom";

export function StudyPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  if (params.get("mode") === "write") return <Navigate to={`/decks/${id}/learn`} replace />;
  return <Navigate to={`/decks/${id}/cards`} replace />;
}
