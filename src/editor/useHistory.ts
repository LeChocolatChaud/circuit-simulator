import { useCallback, useRef, useState } from 'react';

export function useHistory(initial: string) {
  const [source, setSource] = useState(initial);
  const state = useRef({
    past: [] as string[],
    present: initial,
    future: [] as string[],
    typedAt: 0,
  });
  const [version, setVersion] = useState(0);
  const change = useCallback((next: string, typing = false) => {
    const history = state.current;
    if (next === history.present) return;
    const now = Date.now();
    if (!typing || now - history.typedAt > 700) {
      history.past.push(history.present);
      if (history.past.length > 100) history.past.shift();
    }
    history.typedAt = typing ? now : 0;
    history.present = next;
    history.future = [];
    setSource(next);
    setVersion((v) => v + 1);
  }, []);
  const undo = useCallback(() => {
    const h = state.current;
    const previous = h.past.pop();
    if (previous === undefined) return;
    h.future.push(h.present);
    h.present = previous;
    h.typedAt = 0;
    setSource(previous);
    setVersion((v) => v + 1);
  }, []);
  const redo = useCallback(() => {
    const h = state.current;
    const next = h.future.pop();
    if (next === undefined) return;
    h.past.push(h.present);
    h.present = next;
    h.typedAt = 0;
    setSource(next);
    setVersion((v) => v + 1);
  }, []);
  return {
    source,
    change,
    undo,
    redo,
    canUndo: version >= 0 && state.current.past.length > 0,
    canRedo: state.current.future.length > 0,
  };
}
