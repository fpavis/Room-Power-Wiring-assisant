export const HISTORY_LIMIT = 50;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Changes with the same key merge into one undo step, e.g. one continuous drag. */
  coalesceKey: string | null;
}

export const createHistory = <T,>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
  coalesceKey: null,
});

export function commit<T>(
  history: History<T>,
  next: T,
  coalesceKey: string | null = null
): History<T> {
  if (next === history.present) return history;
  if (coalesceKey !== null && coalesceKey === history.coalesceKey) {
    return { ...history, present: next, future: [] };
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    coalesceKey,
  };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    coalesceKey: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    coalesceKey: null,
  };
}
