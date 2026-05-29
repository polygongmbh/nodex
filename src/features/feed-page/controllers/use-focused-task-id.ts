import { useParams } from "react-router-dom";

export function useFocusedTaskId(): string | null {
  return useParams<{ taskId: string }>().taskId ?? null;
}
