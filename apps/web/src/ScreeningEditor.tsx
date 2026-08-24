import { useCallback, useEffect, useState } from "react";
import { addQuestion, deleteQuestion, listQuestions, type ScreeningQuestion } from "./screeningData.js";

const MAX_QUESTIONS = 5;

export function ScreeningQuestionsEditor({ dogId }: { dogId: string }) {
  const [questions, setQuestions] = useState<ScreeningQuestion[] | null>(null);
  const [draft, setDraft] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setQuestions(await listQuestions(dogId)); }
    catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Could not load questions."); }
  }, [dogId]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setErrorText(null);
    if (!draft.trim()) return;
    if ((questions?.length ?? 0) >= MAX_QUESTIONS) { setErrorText(`Maximum ${MAX_QUESTIONS} questions.`); return; }
    try {
      await addQuestion(dogId, draft);
      setDraft("");
      await load();
    } catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Failed."); }
  };

  const remove = async (id: string) => {
    try { await deleteQuestion(id); await load(); }
    catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Failed."); }
  };

  return (
    <div>
      {questions === null ? <p>Loading…</p> : questions.length === 0
        ? <p><small>No screening questions — proceeding can be confirmed freely.</small></p>
        : (
          <ol style={{ paddingLeft: 20, margin: "6px 0" }}>
            {questions.map((q) => (
              <li key={q.id} style={{ marginBottom: 4 }}>
                {q.question}{" "}
                <button onClick={() => void remove(q.id)} style={{ padding: "2px 10px", fontSize: "0.8rem" }}>Remove</button>
              </li>
            ))}
          </ol>
        )}
      {(questions?.length ?? 0) < MAX_QUESTIONS && (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Is your dog health-tested?" aria-label="New question"
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          <button onClick={() => void add()}>Add</button>
        </div>
      )}
      {errorText && <p role="alert">{errorText}</p>}
    </div>
  );
}
