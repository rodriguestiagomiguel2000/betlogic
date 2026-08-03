import { Bet, BetLeg } from '../types';

/**
 * Safely formats an event date string (e.g. "2026-08-15T20:00:00Z") into locale format "Aug 15, 20:00".
 * Returns empty string if invalid or not provided.
 */
export function formatEventDate(eventDateStr?: string): string {
  if (!eventDateStr || typeof eventDateStr !== 'string' || !eventDateStr.trim()) return '';
  const d = new Date(eventDateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Returns the earliest leg event date timestamp for a bet, falling back to the bet's placement date timestamp.
 */
export function getRepresentativeEventDateTimestamp(bet: Bet): number {
  if (bet.legs && bet.legs.length > 0) {
    const timestamps = bet.legs
      .map((leg) => (leg.eventDate ? new Date(leg.eventDate).getTime() : NaN))
      .filter((t) => !isNaN(t));
    if (timestamps.length > 0) {
      return Math.min(...timestamps);
    }
  }
  return new Date(bet.date).getTime();
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
