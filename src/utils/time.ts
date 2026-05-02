/**
 * time.ts — Time and date utility functions.
 */

/** Returns the current date as YYYY-MM-DD. */
export function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Returns an ISO-8601 timestamp string for now. */
export function nowISO(): string {
    return new Date().toISOString();
}

/** Formats a duration in milliseconds as a human-readable string. */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
}

/** Returns the number of days between two dates. */
export function daysBetween(a: Date, b: Date): number {
    return Math.abs(Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Returns a Date N days ago from now. */
export function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
