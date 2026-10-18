import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Cpu,
  FilePlus2,
  GitBranch,
  Layers2,
  LayoutGrid,
  LoaderCircle,
  Play,
  Redo2,
  Save,
  Square,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import { Canvas } from './editor/Canvas';
import { Symbol } from './editor/Symbol';
import { autoLayout } from './editor/layout';
import { useHistory } from './editor/useHistory';
import { Inspector, type Probe } from './inspection/Inspector';
import { Waveform } from './inspection/Waveform';
import { parse, quantity } from './language/parser';
import { declaration, deleteSelection, setProperty } from './language/edit';
import { examples } from './model/examples';
import {
  componentInfo,
  terminalPosition,
  type CircuitDocument,
  type ComponentKind,
  type Point,
  type Selection,
  type SimulationResult,
  type WorkerResponse,
} from './model/types';
import {
  decodeProject,
  download,
  loadLocal,
  project,
  saveLocal,
} from './storage/projects';

const initialDocument = parse(examples.divider).document!;
const exampleNames: Record<keyof typeof examples, string> = {
  divider: 'Voltage divider',
  rc: 'RC step response',
  rl: 'RL step response',
  opamp: 'Op-amp follower',
  dependent: 'Dependent source',
  open: 'Open & floating circuits',
};

export default function App() {
  const [initial] = useState(() => loadLocal() ?? examples.divider);
  const { source, change, undo, redo, canUndo, canRedo } = useHistory(initial);
  const parsed = useMemo(() => parse(source), [source]);
  const lastValid = useRef<CircuitDocument>(parsed.document ?? initialDocument);
  const doc = parsed.document ?? lastValid.current;
  useEffect(() => {
    if (parsed.document) lastValid.current = parsed.document;
  }, [parsed.document]);
  const [selection, setSelection] = useState<Selection>(null);
  const [probe, setProbe] = useState<Probe>({
    quantity: 'voltage',
    target: doc.nodes.some((n) => n.id === 'out')
      ? 'out'
      : (doc.nodes[0]?.id ?? ''),
  });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [resultSource, setResultSource] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [index, setIndex] = useState(0);
  const [textVisible, setTextVisible] = useState(true);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState('');
  const [saveStatus, setSaveStatus] = useState<
    'saving' | 'saved' | 'unavailable'
  >('saved');
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const worker = useRef<Worker | null>(null);
  const currentSource = useRef(source);
  const request = useRef(0);
  const initialRun = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const stale = source !== resultSource;
  const disabled = !parsed.document;
  const sample = !stale ? result?.samples[index] : undefined;

  const commit = useCallback(
    (next: string) => {
      const checked = parse(next);
      if (!checked.document) {
        setToast(
          checked.diagnostics
            .filter((d) => d.severity === 'error')
            .map((d) => d.message)
            .join(' '),
        );
        return;
      }
      change(next);
    },
    [change],
  );
  useEffect(() => {
    currentSource.current = source;
    worker.current?.terminate();
    worker.current = null;
    request.current++;
    setRunning(false);
    setSaveStatus('saving');
    const timer = setTimeout(
      () => setSaveStatus(saveLocal(source) ? 'saved' : 'unavailable'),
      450,
    );
    return () => clearTimeout(timer);
  }, [source]);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [help]);

  const run = useCallback(() => {
    if (!parsed.document) return;
    worker.current?.terminate();
    const revision = ++request.current;
    const next = new Worker(
      new URL('./simulation/worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = next;
    setRunning(true);
    setProgress(0);
    next.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (revision !== request.current) return;
      if (event.data.type === 'progress') setProgress(event.data.progress);
      else {
        setResult(event.data.result);
        setResultSource(source);
        setIndex(0);
        setRunning(false);
        next.terminate();
        if (worker.current === next) worker.current = null;
      }
    };
    next.onerror = (event) => {
      if (revision !== request.current) return;
      setRunning(false);
      setToast(`Simulation worker failed: ${event.message}`);
      next.terminate();
    };
    next.postMessage({ document: parsed.document, revision });
  }, [source, parsed.document]);
  useEffect(() => {
    if (!initialRun.current && parsed.document) {
      initialRun.current = true;
      run();
    }
  }, [run, parsed.document]);
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    request.current++;
    setRunning(false);
    setToast('Simulation stopped.');
  };
  const exportProject = useCallback(() => {
    download(
      `${doc.name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'circuit'}.circuit.json`,
      JSON.stringify(project(source), null, 2),
    );
  }, [doc.name, source]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (help && event.key !== 'Escape') return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(
        (event.target as HTMLElement).tagName,
      );
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        run();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        exportProject();
      }
      if (
        !typing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (
        !typing &&
        (event.key === 'Backspace' || event.key === 'Delete') &&
        selection &&
        !disabled
      ) {
        event.preventDefault();
        commit(deleteSelection(doc, selection));
        setSelection(null);
      }
      if (event.key === 'Escape') {
        setSelection(null);
        setHelp(false);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [run, exportProject, redo, undo, selection, disabled, commit, doc, help]);

  const unique = (prefix: string, ports = 0) => {
    const ids = new Set(
      [...doc.nodes, ...doc.components, ...doc.wires].map((x) => x.id),
    );
    let i = 1;
    while (
      ids.has(`${prefix}${i}`) ||
      Array.from({ length: ports }, (_, port) => `${prefix}${i}_p${port}`).some(
        (id) => ids.has(id),
      )
    )
      i++;
    return `${prefix}${i}`;
  };
  const addNode = (position: Point) => {
    const id = unique('n');
    commit(
      `${source.trimEnd()}\nnode ${id} at=(${position.x},${position.y})\n${!doc.nodes.length ? `reference ${id}\n` : ''}`,
    );
    setSelection({ kind: 'node', id });
  };
  const addWire = (from: string, to: string) => {
    const id = unique('W');
    commit(`${source.trimEnd()}\nwire ${id} ${from} ${to}\n`);
    setSelection({ kind: 'wire', id });
  };
  const addComponent = (kind: ComponentKind) => {
    const info = componentInfo[kind];
    const count = kind === 'opamp' ? 4 : 2;
    const id = unique(info.prefix, count);
    const position = {
      x: 240 + (doc.components.length % 4) * 150,
      y: 240 + Math.floor(doc.components.length / 4) * 140,
    };
    const nodes = Array.from({ length: count }, (_, i) => `${id}_p${i}`);
    let next = source.trimEnd();
    nodes.forEach((node, i) => {
      const p = terminalPosition({ position, rotation: 0, kind }, i);
      next += `\nnode ${node} at=(${p.x},${p.y})`;
    });
    const control =
      kind === 'vcvs' || kind === 'vccs'
        ? ` control=(${doc.nodes[0]?.id ?? nodes[0]},${doc.reference || nodes[1]})`
        : kind === 'ccvs' || kind === 'cccs'
          ? ` control=${doc.components[0]?.id ?? id}`
          : '';
    next += `\n${kind} ${id} (${nodes.join(',')})${info.parameter ? ` ${info.parameter}=${info.defaultValue}` : ''}${control} at=(${position.x},${position.y})\n`;
    if (!doc.nodes.length) next += `reference ${nodes[count - 1]}\n`;
    commit(next);
    setSelection({ kind: 'component', id });
  };
  const move = (selection: NonNullable<Selection>, point: Point) => {
    const item =
      selection.kind === 'node'
        ? doc.nodes.find((n) => n.id === selection.id)
        : doc.components.find((c) => c.id === selection.id);
    if (item)
      commit(setProperty(source, item.line, 'at', `(${point.x},${point.y})`));
  };
  const select = (next: Selection) => {
    setSelection(next);
    if (next)
      setProbe({
        quantity: next.kind === 'node' ? 'voltage' : 'current',
        target: next.id,
      });
  };
  const loadExample = (key: keyof typeof examples) => {
    change(examples[key]);
    setSelection(null);
    setProbe({
      quantity: 'voltage',
      target:
        key === 'opamp' || key === 'dependent'
          ? 'output'
          : key === 'open'
            ? 'dangling'
            : 'out',
    });
    setToast(
      `Opened ${exampleNames[key]}. Undo to restore your previous circuit.`,
    );
  };
  const analysis = (
    mode: 'dc' | 'transient',
    updates?: { stop?: string; step?: string; initialization?: string },
  ) => {
    const settings = doc.analysis;
    const stop = updates?.stop ?? `${settings.stop}s`;
    const step = updates?.step ?? `${settings.step}s`;
    commit(
      declaration(
        source,
        'analysis',
        `analysis ${mode} stop=${stop} step=${step} initialization=${updates?.initialization ?? settings.initialization}`,
      ),
    );
  };
  const diagnostics = [
    ...parsed.diagnostics,
    ...(!stale ? (result?.diagnostics ?? []) : []),
  ];
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const hasResults = !stale && !!result?.samples.length;
  const status = running
    ? `Solving ${Math.round(progress * 100)}%`
    : errors.length
      ? 'Needs attention'
      : hasResults
        ? 'Solution ready'
        : 'Ready to simulate';
  const layout = async () => {
    setLayoutBusy(true);
    try {
      const previousSource = source;
      const next = await autoLayout(doc);
      if (currentSource.current === previousSource) {
        commit(next);
        setLayoutEpoch((v) => v + 1);
      } else setToast('Layout skipped because the circuit changed. Try again.');
    } catch (error) {
      setToast(`Layout failed: ${(error as Error).message}`);
    } finally {
      setLayoutBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label="Circuit Studio home"
        >
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          <span>
            Circuit<span className="brand-light"> Studio</span>
            <small>AN ELECTRICAL WORKBENCH</small>
          </span>
        </a>
        <div className="header-divider" />
        <div className="project-crumb">
          Workspace <ChevronRight size={13} />
          <strong>{doc.name}</strong>
        </div>
        <span className="local-status">
          <span
            className={`status-dot ${saveStatus === 'saved' ? '' : 'pending'}`}
          />
          {saveStatus === 'saved'
            ? 'Saved on this device'
            : saveStatus === 'saving'
              ? 'Saving locally…'
              : 'Local save unavailable · export a copy'}
        </span>
        <button
          className="header-help icon-button"
          aria-label="Open guide"
          title="Quick guide"
          onClick={() => setHelp(true)}
        >
          <CircleHelp size={19} />
        </button>
        <button
          className="button secondary export-button"
          onClick={exportProject}
        >
          <ArrowDownToLine size={15} />
          Export project
        </button>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <Layers2 size={16} />
            <h2>Component library</h2>
            <span>10</span>
          </div>
          <div className="library-section">
            <span className="eyebrow">PASSIVE ELEMENTS</span>
            {(['resistor', 'capacitor', 'inductor'] as ComponentKind[]).map(
              (kind) => (
                <button
                  className="component-card"
                  disabled={disabled}
                  key={kind}
                  onClick={() => addComponent(kind)}
                  title={`Add ${componentInfo[kind].name}`}
                  aria-label={`Add ${componentInfo[kind].name}`}
                >
                  <svg viewBox="-55 -35 110 70" className="palette-symbol">
                    <Symbol kind={kind} />
                  </svg>
                  <span>
                    {componentInfo[kind].name}
                    <small>
                      {componentInfo[kind].prefix} · {componentInfo[kind].unit}
                    </small>
                  </span>
                  <span className="add-plus">+</span>
                </button>
              ),
            )}
          </div>
          <div className="library-section">
            <span className="eyebrow">INDEPENDENT SOURCES</span>
            {(['voltage_source', 'current_source'] as ComponentKind[]).map(
              (kind) => (
                <button
                  className="component-card"
                  disabled={disabled}
                  key={kind}
                  onClick={() => addComponent(kind)}
                  aria-label={`Add ${componentInfo[kind].name}`}
                >
                  <svg viewBox="-55 -35 110 70" className="palette-symbol">
                    <Symbol kind={kind} />
                  </svg>
                  <span>
                    {kind === 'voltage_source'
                      ? 'Voltage source'
                      : 'Current source'}
                    <small>Independent · {componentInfo[kind].prefix}</small>
                  </span>
                  <span className="add-plus">+</span>
                </button>
              ),
            )}
          </div>
          <div className="library-section">
            <span className="eyebrow">CONTROLLED & ACTIVE</span>
            {(['vcvs', 'vccs', 'ccvs', 'cccs', 'opamp'] as ComponentKind[]).map(
              (kind) => (
                <button
                  className="component-card"
                  disabled={disabled}
                  key={kind}
                  onClick={() => addComponent(kind)}
                  title={componentInfo[kind].name}
                  aria-label={`Add ${componentInfo[kind].name}`}
                >
                  <svg viewBox="-55 -45 110 90" className="palette-symbol">
                    <Symbol kind={kind} />
                  </svg>
                  <span>
                    {kind === 'opamp' ? 'Op amp' : kind.toUpperCase()}
                    <small>
                      {kind === 'opamp'
                        ? 'Ideal amplifier'
                        : componentInfo[kind].name}
                    </small>
                  </span>
                  <span className="add-plus">+</span>
                </button>
              ),
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="local-badge">
              <Cpu size={16} />
              <span>
                Built for exploration
                <small>Private. Local. In your browser.</small>
              </span>
            </div>
            <button onClick={() => setHelp(true)}>
              <BookOpen size={15} />
              Language & shortcuts
              <ChevronRight size={14} />
            </button>
          </div>
        </aside>
        <main className="workbench">
          <div className="project-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-line" />
                CIRCUIT WORKSPACE
              </div>
              <h1>{doc.name}</h1>
              <p>Build connections. Discover what flows.</p>
            </div>
            <div className="project-actions">
              <button
                className="icon-button"
                title="Import project or circuit text"
                aria-label="Import project"
                onClick={() => fileInput.current?.click()}
              >
                <ArrowUpFromLine size={18} />
              </button>
              <button
                className="icon-button"
                title="New empty circuit"
                aria-label="New circuit"
                onClick={() => {
                  change(
                    'circuit "Untitled circuit"\n\n# Add components from the library or describe a circuit here.\nanalysis dc\n',
                  );
                  setSelection(null);
                }}
              >
                <FilePlus2 size={18} />
              </button>
              <div className="select-button">
                <LayoutGrid size={15} />
                <select
                  aria-label="Load example"
                  value=""
                  onChange={(e) =>
                    loadExample(e.target.value as keyof typeof examples)
                  }
                >
                  <option value="" disabled>
                    Examples
                  </option>
                  {Object.keys(examples).map((k) => (
                    <option key={k} value={k}>
                      {exampleNames[k as keyof typeof examples]}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </div>
            </div>
          </div>
          <div className="workspace-card">
            <div className="workspace-card-heading">
              <div>
                <span className="section-number">01</span>
                <h2>Design</h2>
                <span className="count-badge">
                  {doc.components.length} elements
                </span>
              </div>
              <div className="design-actions">
                <button
                  className="icon-button"
                  title="Undo"
                  aria-label="Undo"
                  onClick={undo}
                  disabled={!canUndo}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="icon-button"
                  title="Redo"
                  aria-label="Redo"
                  onClick={redo}
                  disabled={!canRedo}
                >
                  <Redo2 size={16} />
                </button>
                <span className="small-divider" />
                <button
                  className="subtle-button"
                  title="Arrange the circuit automatically"
                  disabled={disabled || layoutBusy}
                  onClick={layout}
                >
                  {layoutBusy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <LayoutGrid size={14} />
                  )}
                  <span>Arrange</span>
                </button>
                <button
                  className={`subtle-button ${textVisible ? 'text-active' : ''}`}
                  aria-pressed={textVisible}
                  onClick={() => setTextVisible((v) => !v)}
                >
                  <Code2 size={15} />
                  Circuit text
                </button>
              </div>
            </div>
            <div className={`design-split ${textVisible ? '' : 'hide-text'}`}>
              <Canvas
                key={layoutEpoch}
                doc={doc}
                selection={selection}
                onSelect={select}
                onMove={move}
                onNode={addNode}
                onWire={addWire}
                sample={sample}
                stale={stale}
                disabled={disabled}
                inspector={
                  selection && (
                    <Inspector
                      key={`${selection.kind}-${selection.id}`}
                      doc={doc}
                      selection={selection}
                      sample={sample}
                      stale={stale}
                      disabled={disabled}
                      onChange={commit}
                      onClose={() => setSelection(null)}
                      onProbe={setProbe}
                    />
                  )
                }
              />
              {textVisible && (
                <section className="text-panel">
                  <div className="text-panel-heading">
                    <div>
                      <Code2 size={13} />
                      <span>circuit.cir</span>
                    </div>
                    <span className="language-tag">CDL</span>
                  </div>
                  <div className="code-area">
                    <div
                      className="line-numbers"
                      ref={gutter}
                      aria-hidden="true"
                    >
                      {source.split('\n').map((_, i) => (
                        <div
                          key={i}
                          className={
                            errors.some((e) => e.line === i + 1)
                              ? 'error-line'
                              : ''
                          }
                        >
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    <textarea
                      ref={editor}
                      className="code-editor"
                      aria-label="Circuit description"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      value={source}
                      onChange={(e) => change(e.target.value, true)}
                      onScroll={(e) => {
                        if (gutter.current)
                          gutter.current.scrollTop = e.currentTarget.scrollTop;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          const target = e.currentTarget;
                          const start = target.selectionStart;
                          change(
                            `${source.slice(0, start)}  ${source.slice(target.selectionEnd)}`,
                            true,
                          );
                          requestAnimationFrame(() => {
                            target.selectionStart = target.selectionEnd =
                              start + 2;
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="text-panel-footer">
                    <span className={disabled ? 'text-error' : 'text-good'}>
                      {disabled ? <X size={12} /> : <Check size={12} />}
                      {disabled
                        ? `${errors.length} syntax issue${errors.length === 1 ? '' : 's'}`
                        : 'Schematic in sync'}
                    </span>
                    <button
                      onClick={() =>
                        download('circuit.cir', source, 'text/plain')
                      }
                      title="Download circuit text"
                    >
                      <ArrowDownToLine size={13} />
                    </button>
                  </div>
                </section>
              )}
            </div>
            <div className="simulation-toolbar">
              <div className="mode-toggle" aria-label="Analysis mode">
                <button
                  className={doc.analysis.mode === 'dc' ? 'active' : ''}
                  disabled={disabled}
                  onClick={() => analysis('dc')}
                >
                  DC
                </button>
                <button
                  className={doc.analysis.mode === 'transient' ? 'active' : ''}
                  disabled={disabled}
                  onClick={() => analysis('transient')}
                >
                  Transient
                </button>
              </div>
              {doc.analysis.mode === 'transient' && (
                <div className="timing-settings">
                  <label>
                    Stop
                    <input
                      aria-label="Stop time"
                      key={`stop-${doc.analysis.stop}`}
                      defaultValue={`${doc.analysis.stop}s`}
                      disabled={disabled}
                      onBlur={(e) => {
                        try {
                          if (
                            quantity(e.target.value, 's') !== doc.analysis.stop
                          )
                            analysis('transient', { stop: e.target.value });
                        } catch (error) {
                          setToast((error as Error).message);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  </label>
                  <label>
                    Step
                    <input
                      aria-label="Time step"
                      key={`step-${doc.analysis.step}`}
                      defaultValue={`${doc.analysis.step}s`}
                      disabled={disabled}
                      onBlur={(e) => {
                        try {
                          if (
                            quantity(e.target.value, 's') !== doc.analysis.step
                          )
                            analysis('transient', { step: e.target.value });
                        } catch (error) {
                          setToast((error as Error).message);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  </label>
                  <select
                    aria-label="Initialization"
                    value={doc.analysis.initialization}
                    disabled={disabled}
                    onChange={(e) =>
                      analysis('transient', { initialization: e.target.value })
                    }
                  >
                    <option value="dc">DC initialization</option>
                    <option value="explicit">Explicit initial values</option>
                  </select>
                </div>
              )}
              <span
                className={`simulation-status ${errors.length ? 'error' : ''}`}
                role="status"
              >
                <span className={`status-dot ${hasResults ? '' : 'pending'}`} />
                {status}
              </span>
              <button
                className="button run-button"
                disabled={disabled || !doc.components.length}
                onClick={running ? cancel : run}
              >
                {running ? (
                  <Square size={14} />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                {running ? 'Stop' : 'Run analysis'}
                <kbd>⌘ ↵</kbd>
              </button>
            </div>
          </div>
          {diagnostics.length > 0 && (
            <div className="diagnostics" aria-label="Circuit diagnostics">
              {diagnostics.map((d, i) => (
                <button
                  key={`${d.message}-${i}`}
                  className={d.severity}
                  onClick={() => {
                    if (d.line && editor.current) {
                      const offset =
                        source
                          .split('\n')
                          .slice(0, d.line - 1)
                          .join('\n').length + (d.line > 1 ? 1 : 0);
                      editor.current.focus();
                      editor.current.setSelectionRange(
                        offset,
                        offset + (source.split('\n')[d.line - 1]?.length ?? 0),
                      );
                    }
                  }}
                >
                  <span>{d.severity === 'error' ? '!' : 'i'}</span>
                  <span>
                    {d.line && <strong>Line {d.line} · </strong>}
                    {d.message}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Waveform
            doc={doc}
            result={result}
            stale={stale}
            index={index}
            onIndex={setIndex}
            probe={probe}
            onProbe={setProbe}
          />
          <footer className="workbench-footer">
            <span>
              <GitBranch size={13} />
              {doc.nodes.length} nodes · {doc.wires.length} wires{' '}
              <span className="footer-separator">/</span> Reference:{' '}
              {doc.reference || 'none'}
            </span>
            <span>
              <Zap size={12} />
              Ideal linear models <span className="footer-separator">
                /
              </span>{' '}
              All calculations on your device
            </span>
          </footer>
        </main>
      </div>
      <input
        ref={fileInput}
        className="visually-hidden"
        aria-label="Project file"
        type="file"
        accept=".json,.cir,.txt"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 500000)
              throw new Error('Project exceeds the 500 KB limit.');
            const next = decodeProject(await file.text());
            const imported = parse(next).document!;
            const needsLayout = [
              ...imported.nodes,
              ...imported.components,
            ].some((item) => !item.placed);
            const nextSource = needsLayout ? await autoLayout(imported) : next;
            if (currentSource.current !== source)
              throw new Error(
                'Import skipped because the circuit changed while the file was loading. Try again.',
              );
            change(nextSource);
            setLayoutEpoch((v) => v + 1);
            setSelection(null);
            setToast(`Imported ${file.name}`);
          } catch (error) {
            setToast((error as Error).message);
          }
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <dialog
        ref={helpDialog}
        className="help-dialog"
        onCancel={() => setHelp(false)}
      >
        <div className="help-heading">
          <div>
            <span className="eyebrow">THE FIELD GUIDE</span>
            <h2>A little circuit intuition.</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close guide"
            onClick={() => setHelp(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="help-content">
          <p>
            Draw a circuit, describe it in text, then click{' '}
            <strong>Run analysis</strong>. Everything stays on your device.
          </p>
          <h3>Build & inspect</h3>
          <p>
            Add components from the library. Drag symbols and junctions to move
            them. Use <strong>Connect nodes</strong> to connect two junctions or
            terminals. Crossings only connect at explicit junctions. Click an
            object to see voltage, current, and power, edit its label, or pin a
            measurement to the schematic.
          </p>
          <h3>Circuit description language</h3>
          <pre>{`circuit "My circuit"\nnode supply\nnode out\nnode gnd\nreference gnd\nvoltage_source V1 (supply,gnd) dc=5V\nresistor R1 (supply,out) resistance=1kOhm\ncapacitor C1 (out,gnd) capacitance=10uF\nlabel voltage(out) "Vout"\nanalysis transient stop=50ms step=100us\n  # Put analysis settings on one line.`}</pre>
          <p>
            Component terminal order sets voltage polarity and current
            direction. An op amp takes{' '}
            <code>(in_plus,in_minus,output,return)</code>. Controlled sources
            use <code>control=(a,b)</code> or <code>control=V1</code> and{' '}
            <code>gain=2</code>. Source waveforms use <code>wave=step</code>,{' '}
            <code>pulse</code>, or <code>sine</code> with amplitude, offset, and
            timing parameters.
          </p>
          <h3>Units & results</h3>
          <p>
            Use <code>1kOhm</code>, <code>10uF</code>, <code>5V</code>,{' '}
            <code>2mA</code>, <code>100ms</code>. Prefixes are case sensitive:{' '}
            <code>m</code> is milli, <code>M</code> is mega. Positive power
            means absorbed; negative means delivered. Floating voltages and
            ambiguous wire-loop currents appear as{' '}
            <strong>Indeterminate</strong>.
          </p>
          <p>
            DC initialization starts at the sources’ <code>dc</code> values.
            Explicit initialization uses capacitor <code>initial_voltage</code>{' '}
            and inductor <code>initial_current</code> (default zero). Backward
            Euler is stable but approximate: reduce the timestep to check
            accuracy. Ideal op amps model output-port power; supply consumption
            is not modeled.
          </p>
          <h3>Keyboard</h3>
          <div className="shortcut-grid">
            <span>Run analysis</span>
            <kbd>Ctrl / ⌘ + Enter</kbd>
            <span>Export project</span>
            <kbd>Ctrl / ⌘ + S</kbd>
            <span>Undo / redo outside text fields</span>
            <kbd>Ctrl / ⌘ + Z / Shift + Z</kbd>
            <span>Delete selection</span>
            <kbd>Delete</kbd>
            <span>Close popup</span>
            <kbd>Esc</kbd>
          </div>
        </div>
        <div className="help-footer">
          <Save size={14} />
          Automatic local save · Export a project to keep a portable copy.
        </div>
      </dialog>
    </div>
  );
}
