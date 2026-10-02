import { describe, it, expect } from 'vitest';
import { parseKnowledgeAnswerResponse } from '../../../common/llm/llm-response.parser';

const passages = [
  { id: 'c1', title: 'Доставка', url: 'https://x/delivery', text: 'a' },
  { id: 'c2', title: 'Бонусы', url: 'https://x/bonus', text: 'b' },
];

describe('parseKnowledgeAnswerResponse', () => {
  it('keeps only passage ids that were handed to the model, without duplicates', () => {
    const result = parseKnowledgeAnswerResponse(
      JSON.stringify({
        answer_text: 'Ответ',
        used_passage_ids: ['c2', 'zzz', 'c2', 7],
        not_found: false,
      }),
      passages,
    );
    expect(result.used_passage_ids).toEqual(['c2']);
    expect(result.answer_text).toBe('Ответ');
    expect(result.not_found).toBe(false);
  });

  it('substitutes a default text when answer_text is empty', () => {
    const result = parseKnowledgeAnswerResponse(JSON.stringify({ answer_text: '   ' }), passages);
    expect(result.answer_text).toBe('Подробности смотрите на странице сайта.');
    expect(result.used_passage_ids).toEqual([]);
    expect(result.not_found).toBe(false);
  });

  it('coerces not_found to a boolean and keeps only string quick replies (max 3)', () => {
    const result = parseKnowledgeAnswerResponse(
      JSON.stringify({
        answer_text: 'x',
        not_found: 'yes',
        quick_replies: ['a', 2, '', 'b', 'c', 'd'],
      }),
      passages,
    );
    expect(result.not_found).toBe(true);
    expect(result.quick_replies).toEqual(['a', 'b', 'c']);
  });

  it('strips a ```json fence', () => {
    const result = parseKnowledgeAnswerResponse(
      '```json\n{"answer_text":"Ок","used_passage_ids":["c1"]}\n```',
      passages,
    );
    expect(result.answer_text).toBe('Ок');
    expect(result.used_passage_ids).toEqual(['c1']);
  });

  it('throws on a non-object payload', () => {
    expect(() => parseKnowledgeAnswerResponse('[]', passages)).toThrow();
    expect(() => parseKnowledgeAnswerResponse('not json', passages)).toThrow();
  });
});
