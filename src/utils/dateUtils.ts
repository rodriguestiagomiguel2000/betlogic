import { Bet } from '../types';

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
