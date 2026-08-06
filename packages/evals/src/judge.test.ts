import { describe, expect, it, vi } from 'vitest';
import { buildJudgePrompt, createAiSdkJudge, judgeAnswer } from './judge';

describe('buildJudgePrompt', () => {
  it('includes the question, cited passages in label order, answer, and reference summary', () => {
    const prompt = buildJudgePrompt({
      question: 'What is GSA?',
      citedChunks: [
        { label: 1, content: 'GSA is a routing variant.' },
        { label: 2, content: 'It uses a sigmoid gate.' },
      ],
      answer: 'GSA is a routing variant that uses a sigmoid gate. [1][2]',
      expectedAnswerSummary: 'A routing variant using a learned sigmoid gate.',
    });

    expect(prompt).toContain('What is GSA?');
    expect(prompt).toContain('[1] GSA is a routing variant.');
    expect(prompt).toContain('[2] It uses a sigmoid gate.');
    expect(prompt).toContain('GSA is a routing variant that uses a sigmoid gate. [1][2]');
    expect(prompt).toContain('A routing variant using a learned sigmoid gate.');
  });

  it('renders a placeholder when the answer cited nothing', () => {
    const prompt = buildJudgePrompt({
      question: 'Does it support X?',
      citedChunks: [],
      answer: "I couldn't find that in your documents.",
      expectedAnswerSummary: 'Refusal expected.',
    });
    expect(prompt).toContain('(the answer cited no passages)');
  });
});

describe('judgeAnswer', () => {
  it('passes the built prompt to the injected judge function', async () => {
    const fakeRubric = {
      faithfulness: { score: 5, rationale: 'fully grounded' },
      answer_relevance: { score: 4, rationale: 'answers the question' },
      citation_accuracy: { score: 5, rationale: 'precise citations' },
    };
    const judge = vi.fn().mockResolvedValue(fakeRubric);

    const result = await judgeAnswer(judge, {
      question: 'What is GSA?',
      citedChunks: [{ label: 1, content: 'GSA is a routing variant.' }],
      answer: 'GSA is a routing variant. [1]',
      expectedAnswerSummary: 'A routing variant.',
    });

    expect(judge).toHaveBeenCalledWith(expect.stringContaining('What is GSA?'));
    expect(result).toEqual(fakeRubric);
  });
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateObject: vi.fn() };
});

describe('createAiSdkJudge', () => {
  it('calls generateObject with the resolved model, rubric schema, and prompt', async () => {
    const { generateObject } = await import('ai');
    const fakeRubric = {
      faithfulness: { score: 3, rationale: 'partially grounded' },
      answer_relevance: { score: 3, rationale: 'mostly answers it' },
      citation_accuracy: { score: 3, rationale: 'ok citations' },
    };
    vi.mocked(generateObject).mockResolvedValue({ object: fakeRubric } as never);

    const fakeModel = { modelId: 'gpt-5-mini' } as never;
    const judge = createAiSdkJudge(fakeModel);
    const result = await judge('some prompt');

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: fakeModel, prompt: 'some prompt' }),
    );
    expect(result).toEqual(fakeRubric);
  });
});
