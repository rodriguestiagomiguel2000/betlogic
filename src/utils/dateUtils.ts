import { Bet, BetLeg } from '../types';

/**
 * Safely parses various date/time formats (ISO string, "YYYY-MM-DD HH:mm", "DD/MM/YYYY HH:mm", etc.)
 * into a valid local Date object without UTC midnight timezone distortion.
 */
export function parseDateString(str?: string): Date | null {
  if (!str || typeof str !== 'string' || !str.trim()) return null;
  const s = str.trim();

  // Pattern 1: ISO or date-time with T or space e.g. "2026-08-03T20:30:00", "2026-08-03 20:30"
  const isoTimeMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoTimeMatch) {
    const [, year, month, day, hour, min, sec] = isoTimeMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec || 0));
  }

  // Pattern 2: ISO date-only "2026-08-03" -> default to noon 12:00 local time to avoid 00:00 UTC shift
  const isoDateOnlyMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnlyMatch) {
    const [, year, month, day] = isoDateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  }

  // Pattern 3: DD/MM/YYYY or DD/MM/YYYY, HH:mm
  const ddmmyyyyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (ddmmyyyyMatch) {
    const [, day, month, year, hour, min] = ddmmyyyyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), hour ? Number(hour) : 12, min ? Number(min) : 0);
  }

  // Pattern 4: DD/MM HH:mm or DD/MM
  const ddmmMatch = s.match(/^(\d{1,2})\/(\d{1,2})(?:[,\s•]+(\d{1,2}):(\d{2}))?/);
  if (ddmmMatch) {
    const [, day, month, hour, min] = ddmmMatch;
    const year = new Date().getFullYear();
    return new Date(year, Number(month) - 1, Number(day), hour ? Number(hour) : 12, min ? Number(min) : 0);
  }

  // Fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d;
  }

  return null;
}

/**
 * Returns the Date object of the last (latest) event or leg in the bet.
 * If legs have valid event dates, returns the maximum (latest) date among them.
 * Falls back to bet.date or current date.
 */
export function getBetLatestEventDate(bet: Bet): Date {
  if (bet.legs && bet.legs.length > 0) {
    const timestamps = bet.legs
      .map((leg) => {
        const parsed = parseDateString(leg.eventDate);
        return parsed ? parsed.getTime() : NaN;
      })
      .filter((t) => !isNaN(t));

    if (timestamps.length > 0) {
      return new Date(Math.max(...timestamps));
    }
  }

  if (bet.date) {
    const parsed = parseDateString(bet.date);
    if (parsed) return parsed;
  }

  return new Date();
}

/**
 * Formats the bet's representative date & time based on the time of its last event/leg.
 * Example output: "03/08/2026, 20:30" or "03/08/2026, 17:40"
 */
export function formatBetDateTime(bet: Bet): string {
  const d = getBetLatestEventDate(bet);
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

/**
 * Safely formats an event date string (e.g. "2026-08-15T20:00:00Z") into locale format "15 Aug, 20:00".
 * Returns empty string if invalid or not provided.
 */
export function formatEventDate(eventDateStr?: string): string {
  if (!eventDateStr || typeof eventDateStr !== 'string' || !eventDateStr.trim()) return '';
  const d = parseDateString(eventDateStr);
  if (!d || isNaN(d.getTime())) return '';

  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day} ${month}, ${hours}:${minutes}`;
}

/**
 * Returns the latest leg event date timestamp for a bet, falling back to the bet's placement date timestamp.
 */
export function getRepresentativeEventDateTimestamp(bet: Bet): number {
  return getBetLatestEventDate(bet).getTime();
}

/**
 * Formats a leg selection string for display, ensuring binary or bare selections
 * (such as "Sim", "Não", "Yes", "No", "Over", "Under") or selections without market context
 * are displayed together with their market context (e.g. "Ambas Marcam (BTTS): Sim").
 */
export function formatLegSelection(selection?: string, market?: string): string {
  const sel = (selection || '').trim();
  const mkt = (market || '').trim();

  if (!sel) return mkt || 'Selection';
  if (!mkt || mkt === 'Match Odds' || mkt === 'Match Result' || mkt === 'Moneyline' || mkt === 'Winner') {
    return sel;
  }

  const selLower = sel.toLowerCase();
  const mktLower = mkt.toLowerCase();

  // If selection is already formatted with colon (e.g. "BTTS: Sim") or starts with market name, return as is
  if (sel.includes(':') || selLower.startsWith(mktLower)) {
    return sel;
  }

  // Common generic / binary choices in sports betting (Portuguese, English, etc.)
  const isGenericOrBinary =
    selLower === 'sim' ||
    selLower === 'não' ||
    selLower === 'nao' ||
    selLower === 'yes' ||
    selLower === 'no' ||
    selLower === 'over' ||
    selLower === 'under' ||
    selLower === 'draw' ||
    selLower === 'empate' ||
    selLower === 'true' ||
    selLower === 'false' ||
    selLower === '1' ||
    selLower === '2' ||
    selLower === 'x';

  if (isGenericOrBinary) {
    return `${mkt}: ${sel}`;
  }

  return sel;
}

/**
 * Calculates raw and effective total odds for a list of bet legs.
 * Correctly accounts for Bet Builder groups where multiple sub-selections share a single builder odds value.
 */
export function calculateLegsOdds(legs: BetLeg[]): { rawTotalOdds: number; effectiveTotalOdds: number } {
  if (!legs || legs.length === 0) {
    return { rawTotalOdds: 1.0, effectiveTotalOdds: 1.0 };
  }

  const builderGroups: Record<string, { legs: BetLeg[]; odds: number }> = {};
  const singleLegs: BetLeg[] = [];

  for (const leg of legs) {
    if (leg.builderId && leg.builderId.trim()) {
      const bId = leg.builderId.trim();
      if (!builderGroups[bId]) {
        const groupOdds = leg.builderOdds && leg.builderOdds > 0 ? leg.builderOdds : (leg.odds && leg.odds > 0 ? leg.odds : 1.0);
        builderGroups[bId] = { legs: [], odds: groupOdds };
      }
      builderGroups[bId].legs.push(leg);
    } else {
      singleLegs.push(leg);
    }
  }

  let rawTotal = 1.0;
  for (const leg of singleLegs) {
    rawTotal *= (leg.odds && leg.odds > 0 ? leg.odds : 1.0);
  }
  for (const bId in builderGroups) {
    rawTotal *= builderGroups[bId].odds;
  }

  let effectiveTotal = 1.0;
  for (const leg of singleLegs) {
    if (leg.status === 'void') {
      effectiveTotal *= 1.0;
    } else {
      effectiveTotal *= (leg.odds && leg.odds > 0 ? leg.odds : 1.0);
    }
  }
  for (const bId in builderGroups) {
    const group = builderGroups[bId];
    const allVoid = group.legs.every((l) => l.status === 'void');
    if (allVoid) {
      effectiveTotal *= 1.0;
    } else {
      effectiveTotal *= group.odds;
    }
  }

  return {
    rawTotalOdds: Number(rawTotal.toFixed(3)),
    effectiveTotalOdds: Number(effectiveTotal.toFixed(3)),
  };
}
