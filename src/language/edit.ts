import type { CircuitDocument, Selection } from '../model/types';
import { splitComment } from './parser';

export function replaceLine(
  source: string,
  line: number,
  replacement: string,
): string {
  const lines = source.split('\n');
  const [body, comment] = splitComment(lines[line - 1] ?? '');
  lines[line - 1] = replacement
    ? `${body.match(/^\s*/)?.[0] ?? ''}${replacement}${comment ? ` ${comment}` : ''}`
    : comment;
  return lines.join('\n');
}
export function setProperty(
  source: string,
  line: number,
  key: string,
  value: string,
): string {
  const body = splitComment(source.split('\n')[line - 1])[0].trim();
  const match = [
    ...body.matchAll(/\b([a-z_]+)\s*=\s*("(?:\\.|[^"\\])*"|\([^)]*\)|[^\s]+)/g),
  ].find((m) => m[1] === key);
  return replaceLine(
    source,
    line,
    match
      ? `${body.slice(0, match.index)}${key}=${value}${body.slice(match.index + match[0].length)}`
      : `${body} ${key}=${value}`,
  );
}
export function getProperty(
  source: string,
  line: number,
  key: string,
  fallback: string,
): string {
  const body = splitComment(source.split('\n')[line - 1])[0];
  return (
    [
      ...body.matchAll(
        /\b([a-z_]+)\s*=\s*("(?:\\.|[^"\\])*"|\([^)]*\)|[^\s]+)/g,
      ),
    ].find((m) => m[1] === key)?.[2] ?? fallback
  );
}
export function declaration(
  source: string,
  keyword: string,
  text: string,
): string {
  const index = source
    .split('\n')
    .findIndex((l) => splitComment(l)[0].trim().startsWith(`${keyword} `));
  return index < 0
    ? `${source.trimEnd()}\n${text}\n`
    : replaceLine(source, index + 1, text);
}
export function setAnnotation(
  doc: CircuitDocument,
  quantity: 'voltage' | 'current',
  target: string,
  text: string,
): string {
  const existing = doc.annotations.find(
    (a) => a.quantity === quantity && a.target === target,
  );
  const replacement = text
    ? `label ${quantity}(${target}) ${JSON.stringify(text)}`
    : '';
  return existing
    ? replaceLine(doc.source, existing.line, replacement)
    : replacement
      ? `${doc.source.trimEnd()}\n${replacement}\n`
      : doc.source;
}
export function deleteSelection(
  doc: CircuitDocument,
  selection: Selection,
): string {
  if (!selection || selection.kind === 'lead') return doc.source;
  const removed = new Set<string>([selection.id]);
  const selectedNode = doc.nodes.find((n) => n.id === selection.id);
  if (selection.kind === 'node' && selectedNode?.terminal)
    removed.add(selectedNode.terminal.component);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of doc.components) {
      const affected =
        c.bindings.some((n) => removed.has(n)) ||
        (Array.isArray(c.control)
          ? c.control.some((n) => removed.has(n))
          : !!c.control && removed.has(c.control));
      if (affected && !removed.has(c.id)) {
        removed.add(c.id);
        changed = true;
      }
      if (removed.has(c.id))
        for (const id of c.nodes)
          if (!removed.has(id)) {
            removed.add(id);
            changed = true;
          }
    }
  }
  const lines = new Set<number>();
  doc.nodes
    .filter((n) => removed.has(n.id) && n.line > 0)
    .forEach((n) => lines.add(n.line));
  doc.components
    .filter((c) => removed.has(c.id))
    .forEach((c) => lines.add(c.line));
  doc.wires
    .filter(
      (w) =>
        !w.implicit &&
        (removed.has(w.id) || removed.has(w.from) || removed.has(w.to)),
    )
    .forEach((w) => {
      lines.add(w.line);
      removed.add(w.id);
    });
  doc.annotations
    .filter((a) => removed.has(a.target) || removed.has(a.target.split('.')[0]))
    .forEach((a) => lines.add(a.line));
  let source = doc.source;
  lines.forEach((line) => {
    source = replaceLine(source, line, '');
  });
  if (removed.has(doc.reference)) {
    const next = doc.nodes.find((n) => !removed.has(n.id));
    const refLine = source
      .split('\n')
      .findIndex((l) => splitComment(l)[0].trim().startsWith('reference '));
    if (refLine >= 0)
      source = replaceLine(
        source,
        refLine + 1,
        next ? `reference ${next.id}` : '',
      );
  }
  return source;
}
