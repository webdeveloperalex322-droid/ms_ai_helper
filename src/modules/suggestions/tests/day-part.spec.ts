import { describe, it, expect, vi } from 'vitest';
import { DayPartService, DEFAULT_WINDOWS } from '../services/day-part.service';

function makeService(values: Record<string, any> = {}) {
  const config = { get: vi.fn().mockImplementation((key: string) => values[key]) };
  return new DayPartService(config as any);
}

/** A moment at the given UTC hour, read back in a UTC+0 timezone. */
function atUtcHour(hour: number): Date {
  return new Date(Date.UTC(2026, 9, 2, hour, 30));
}

describe('DayPartService — current day part', () => {
  const service = () => makeService({ SUGGESTIONS_TIMEZONE: 'UTC' });

  it('reads the lunch window', () => {
    expect(service().current(atUtcHour(12))).toBe('lunch');
  });

  it('reads the evening window', () => {
    expect(service().current(atUtcHour(20))).toBe('evening');
  });

  it('treats a window crossing midnight as one stretch', () => {
    expect(service().current(atUtcHour(23))).toBe('night');
    expect(service().current(atUtcHour(2))).toBe('night');
  });

  it('returns null between the windows', () => {
    // 16:30 is past lunch (ends at 16) and before the evening (starts at 17).
    expect(service().current(atUtcHour(16))).toBeNull();
  });

  it('includes the start hour and excludes the end hour', () => {
    expect(service().current(new Date(Date.UTC(2026, 9, 2, 11, 0)))).toBe('lunch');
    expect(service().current(new Date(Date.UTC(2026, 9, 2, 16, 0)))).toBeNull();
  });

  it('reads the hour in the configured timezone', () => {
    // 07:30 UTC is 12:30 in Yekaterinburg (UTC+5): lunch there, nothing in UTC.
    const tyumen = makeService({ SUGGESTIONS_TIMEZONE: 'Asia/Yekaterinburg' });

    expect(tyumen.current(atUtcHour(7))).toBe('lunch');
    expect(service().current(atUtcHour(7))).toBeNull();
  });

  it('falls back to server time for an unknown timezone', () => {
    const broken = makeService({ SUGGESTIONS_TIMEZONE: 'Mars/Olympus' });

    expect(() => broken.current()).not.toThrow();
  });
});

describe('DayPartService — windows configuration', () => {
  it('uses the configured windows', () => {
    const service = makeService({
      SUGGESTIONS_TIMEZONE: 'UTC',
      SUGGESTIONS_DAYPART_WINDOWS: '{"lunch":[9,11]}',
    });

    expect(service.current(atUtcHour(10))).toBe('lunch');
    expect(service.current(atUtcHour(12))).toBeNull();
  });

  it('falls back to the defaults on invalid json', () => {
    const service = makeService({
      SUGGESTIONS_TIMEZONE: 'UTC',
      SUGGESTIONS_DAYPART_WINDOWS: 'not json',
    });

    expect(service.current(atUtcHour(12))).toBe('lunch');
  });

  it('falls back to the defaults when no window survives validation', () => {
    const service = makeService({
      SUGGESTIONS_TIMEZONE: 'UTC',
      SUGGESTIONS_DAYPART_WINDOWS: '{"lunch":["noon","midnight"]}',
    });

    expect(service.current(atUtcHour(12))).toBe('lunch');
    expect(DEFAULT_WINDOWS.lunch).toEqual([11, 16]);
  });
});

describe('DayPartService — scenario mapping', () => {
  const service = makeService();

  it('maps the known scenarios', () => {
    expect(service.dayPartOf('lunch')).toBe('lunch');
    expect(service.dayPartOf('dinner')).toBe('evening');
    expect(service.dayPartOf('evening')).toBe('evening');
    expect(service.dayPartOf('movie')).toBe('evening');
  });

  it('leaves unmapped and missing scenarios neutral', () => {
    expect(service.dayPartOf('birthday')).toBeNull();
    expect(service.dayPartOf(null)).toBeNull();
    expect(service.dayPartOf(undefined)).toBeNull();
  });
});
