import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

export interface ScreeningQuestion { id: string; dog_id: string; position: number; question: string }
export interface PendingQuestion { id: string; question: string; for_dog_name: string }

// --- Owner: manage own dog's questions ---

export async function listQuestions(dogId: string): Promise<ScreeningQuestion[]> {
  const { data, error } = await supabase
    .from("dog_screening_questions")
    .select("id,dog_id,position,question")
    .eq("dog_id", dogId)
    .order("position");
  if (error) throw new AppError("UNAVAILABLE", "Could not load screening questions.");
  return (data ?? []) as ScreeningQuestion[];
}

export async function addQuestion(dogId: string, question: string): Promise<void> {
  const { data: existing } = await supabase.from("dog_screening_questions").select("position").eq("dog_id", dogId).order("position", { ascending: false }).limit(1);
  const nextPos = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;
  const { error } = await supabase.from("dog_screening_questions").insert({ dog_id: dogId, question: question.trim(), position: nextPos });
  if (error) throw new AppError("VALIDATION_ERROR", error.message.includes("check") ? "Question must be 3–300 characters." : "Could not add question.");
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.from("dog_screening_questions").delete().eq("id", questionId);
  if (error) throw new AppError("FORBIDDEN", "Could not remove question.");
}

// --- Connection participant: pending questions + answering ---

export async function pendingQuestions(connectionId: string): Promise<PendingQuestion[]> {
  const { data, error } = await supabase.rpc("pending_screening_questions", { p_connection_id: connectionId });
  if (error) throw new AppError("UNAVAILABLE", "Could not load screening questions.");
  return (data ?? []) as PendingQuestion[];
}

export async function answerQuestion(connectionId: string, questionId: string, answer: string): Promise<void> {
  const trimmed = answer.trim();
  if (!trimmed || trimmed.length > 2000) throw new AppError("VALIDATION_ERROR", "Answer must be 1–2000 characters.");
  const { error } = await supabase.from("screening_answers").insert({ connection_id: connectionId, question_id: questionId, answer: trimmed });
  if (error) throw new AppError("CONFLICT", error.message.includes("duplicate") ? "Already answered." : "Answer could not be saved.");
}
