import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DayPart = string;

/** [startHour, endHour); an interval that wraps midnight is one stretch. */
export type DayPartWindows = Record<DayPart, [number, number]>;

export const DEFAULT_WINDOWS: DayPartWindows = {
  lunch: [11, 16],
  evening: [17, 23],
  night: [23, 5],
};

/**
 * Scenario carried by a suggestion payload → the day part it belongs to.
 * The scenarios come from the seeded presets (`lunch`, `dinner`, `evening`,
 * `movie`, `birthday`); anything unmapped stays neutral.
 */
export const SCENARIO_DAY_PARTS: Record<string, DayPart> = {
  lunch: 'lunch',
  dinner: 'evening',
  evening: 'evening',
  movie: 'evening',
};

/**
 * Tells the selector which day part it is now and which day part a suggestion
 * belongs to (spec 012, FR-021).
 *
 * `cities` carries no timezone, so the hour is read in the network's timezone
 * from configuration rather than per city.
 */
@Injectable()
export class DayPartService {
  private readonly logger = new Logger(DayPartService.name);
  private cachedWindows?: DayPartWindows;

  constructor(private readonly config: ConfigService) {}

  /** The day part the given moment falls into, or null outside every window. */
  current(now: Date = new Date()): DayPart | null {
    const hour = this.hourInTimezone(now);
    const windows = this.windows();

    for (const [part, [start, end]] of Object.entries(windows)) {
      if (this.inWindow(hour, start, end)) return part;
    }

    return null;
  }

  /** The day part a suggestion scenario belongs to, or null when unmapped. */
  dayPartOf(scenario: string | null | undefined): DayPart | null {
    if (!scenario) return null;
    return SCENARIO_DAY_PARTS[scenario] ?? null;
  }

  private inWindow(hour: number, start: number, end: number): boolean {
    // 23 → 5 wraps midnight, so the two halves are tested separately.
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  }

  private hourInTimezone(now: Date): number {
    const timeZone = this.config?.get<string>('SUGGESTIONS_TIMEZONE');
    if (!timeZone) return now.getHours();

    try {
      const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: 'numeric',
        hour12: false,
      }).format(now);

      const hour = Number(formatted);
      return Number.isFinite(hour) ? hour % 24 : now.getHours();
    } catch (err) {
      this.logger.warn(`Unknown timezone ${timeZone}, falling back to server time: ${err}`);
      return now.getHours();
    }
  }

  private windows(): DayPartWindows {
    if (this.cachedWindows) return this.cachedWindows;

    const raw = this.config?.get<string>('SUGGESTIONS_DAYPART_WINDOWS');
    this.cachedWindows = this.parseWindows(raw);
    return this.cachedWindows;
  }

  private parseWindows(raw: string | undefined): DayPartWindows {
    if (!raw) return DEFAULT_WINDOWS;

    try {
      const parsed = JSON.parse(raw);
      const windows: DayPartWindows = {};

      for (const [part, bounds] of Object.entries(parsed)) {
        if (
          Array.isArray(bounds) &&
          bounds.length === 2 &&
          bounds.every((b) => typeof b === 'number' && b >= 0 && b <= 24)
        ) {
          windows[part] = [bounds[0], bounds[1]];
        }
      }

      return Object.keys(windows).length ? windows : DEFAULT_WINDOWS;
    } catch (err) {
      this.logger.warn(`Invalid SUGGESTIONS_DAYPART_WINDOWS, using defaults: ${err}`);
      return DEFAULT_WINDOWS;
    }
  }
}
