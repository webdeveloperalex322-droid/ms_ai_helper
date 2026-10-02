import { describe, it, expect } from 'vitest';
import { ResponseValidatorService } from '../services/response-validator.service';

const validator = new ResponseValidatorService({} as any);

describe('ResponseValidatorService.sanitizeFreeText', () => {
  it('replaces medical-safety claims', () => {
    expect(validator.sanitizeFreeText('Этот ролл 100% безопасно для аллергиков.')).toBe(
      'Этот ролл уточните состав у ресторана для аллергиков.',
    );
  });

  it('leaves service topics untouched (delivery, payment, bonuses, promo codes)', () => {
    const text =
      'Доставка бесплатная, оплата картой или наличными, бонусы начисляются 3%, промокод ЯСАМ даёт скидку.';
    expect(validator.sanitizeFreeText(text)).toBe(text);
  });

  it('trims whitespace and handles empty input', () => {
    expect(validator.sanitizeFreeText('  привет  ')).toBe('привет');
    expect(validator.sanitizeFreeText('')).toBe('');
  });

  it('cuts texts longer than 1200 characters at a sentence boundary', () => {
    const sentence = 'Это предложение про доставку и оплату заказа. ';
    const long = sentence.repeat(40); // ~1880 chars
    const result = validator.sanitizeFreeText(long);
    expect(result.length).toBeLessThanOrEqual(1200);
    expect(result.endsWith('.')).toBe(true);
  });

  it('adds an ellipsis when no sentence boundary is available', () => {
    const result = validator.sanitizeFreeText('слово '.repeat(400));
    expect(result.length).toBeLessThanOrEqual(1201);
    expect(result.endsWith('…')).toBe(true);
  });
});
