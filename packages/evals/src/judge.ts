import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { JudgeScore } from './schema';

export type JudgeInput = {
  question: string;
  // The passages the chat turn actually retrieved and cited, in citation-label
  // order ([1], [2], ...) — what citation_accuracy is judged against.
  citedChunks: { label: number; content: string }[];
  answer: string;
  expectedAnswerSummary: string;
};

const JudgeRubric = z.object({
  faithfulness: JudgeScore,
  answer_relevance: JudgeScore,
  citation_accuracy: JudgeScore,
});
export type JudgeRubric = z.infer<typeof JudgeRubric>;

// A judge call takes the assembled prompt and returns the rubric. Kept as an
// injectable function (rather than judgeAnswer calling generateObject
// directly) so scoring logic is unit-testable with a fake judge — no network,
// no API key — while `createAiSdkJudge` below wires the real EVAL_JUDGE_MODEL
// for runner.ts's live run.
export type JudgeFn = (prompt: string) => Promise<JudgeRubric>;

// README "Scoring" layer 2: faithfulness (is the answer supported by the cited
// chunks?), answer_relevance (does it answer the question?), citation_accuracy
// (are the cited chunks the right ones, per expected_answer_summary?). Each
// 1-5. Only called for non-`no_answer` items — refusal correctness scores
// those instead.
export function buildJudgePrompt(input: JudgeInput): string {
  const context = input.citedChunks.length
    ? input.citedChunks.map((chunk) => `[${chunk.label}] ${chunk.content}`).join('\n\n')
    : '(the answer cited no passages)';

  return `You are grading one turn of a RAG chat assistant against a golden reference. Score three dimensions from 1 (worst) to 5 (best), each with a one-sentence rationale.

<question>
${input.question}
</question>

<cited_passages>
${context}
</cited_passages>

<model_answer>
${input.answer}
</model_answer>

<reference_answer_summary>
${input.expectedAnswerSummary}
</reference_answer_summary>

Score:
- faithfulness: every factual claim in the model answer is supported by the cited passages (no invention, no outside knowledge). 5 = fully grounded, 1 = fabricated or contradicts the passages.
- answer_relevance: the model answer actually addresses the question asked, matching the intent and scope of the reference summary. 5 = fully answers it, 1 = off-topic or non-answer.
- citation_accuracy: the passages cited are the ones that actually support the answer (not irrelevant passages tacked on, not missing an obviously-used passage). 5 = precise, 1 = citations don't back the claims.

Be strict: an answer that reads well but drifts from the cited passages should score low on faithfulness even if it sounds relevant.`;
}

export async function judgeAnswer(judge: JudgeFn, input: JudgeInput): Promise<JudgeRubric> {
  return judge(buildJudgePrompt(input));
}

// Real judge backed by the configured EVAL_JUDGE_MODEL (ADR-016), via the AI
// SDK's structured-output mode. Judge calls are project-paid infra cost, not
// BYOK (ADR-006) — resolveJudgeModel never takes a user key.
export function createAiSdkJudge(model: LanguageModel): JudgeFn {
  return async (prompt: string) => {
    const { object } = await generateObject({ model, schema: JudgeRubric, prompt });
    return object;
  };
}
