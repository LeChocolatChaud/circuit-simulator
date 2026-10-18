import { parse } from '../language/parser';
const key = 'circuit-studio.project.v1';
export type ProjectFile = {
  format: 'circuit-studio';
  version: 1;
  source: string;
};
export function project(source: string): ProjectFile {
  return { format: 'circuit-studio', version: 1, source };
}
export function saveLocal(source: string): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(project(source)));
    return true;
  } catch {
    return false;
  }
}
export function loadLocal(): string | null {
  try {
    const data = localStorage.getItem(key);
    return data ? decodeProject(data, false) : null;
  } catch {
    return null;
  }
}
export function decodeProject(text: string, validate = true): string {
  let source = text;
  if (text.trimStart().startsWith('{')) {
    const value = JSON.parse(text);
    if (
      value.format !== 'circuit-studio' ||
      value.version !== 1 ||
      typeof value.source !== 'string'
    )
      throw new Error('Unsupported project format or version.');
    source = value.source;
  }
  if (source.length > 500000)
    throw new Error('Project exceeds the 500 KB limit.');
  if (validate) {
    const parsed = parse(source);
    if (!parsed.document)
      throw new Error(
        parsed.diagnostics
          .map((d) => `Line ${d.line ?? '?'}: ${d.message}`)
          .join('\n'),
      );
  }
  return source;
}
export function download(
  name: string,
  text: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
