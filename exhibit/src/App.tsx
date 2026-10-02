import { useEffect, useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import {
  Activity,
  Atom,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  Layers,
  Radio,
  RefreshCw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

type FileKind = 'run' | 'session' | 'archive' | 'notes' | 'reference' | 'code';

interface ArchiveFile {
  path: string;
  sha: string;
  size: number;
  ext: string;
  kind: FileKind;
  date: string | null;
  empty: boolean;
  htmlUrl: string;
}

interface ArchiveStats {
  files: number;
  markdown: number;
  nonEmptyMarkdown: number;
  uniqueMarkdownBlobs: number;
  duplicateMarkdownCopies: number;
  totalMarkdownBytes: number;
  pdfs: number;
  codeFiles: number;
}

interface ArchivePayload {
  repo: string;
  branch: string;
  fetchedAt: string;
  files: ArchiveFile[];
  stats: ArchiveStats;
}

interface RunRecord {
  id: string;
  created: string;
  stack: string[];
  realityEngines: string[];
  compositionEngines: string[];
  seed: string;
  energy: string;
  model: string;
  starred: string;
  feedback: string;
  fingerprint: string;
  characterCounts: string;
  style: string;
  lyrics: string;
  caption: string;
  raw: string;
}

const kindOrder: Array<'all' | FileKind> = [
  'all',
  'archive',
  'session',
  'run',
  'notes',
  'reference',
  'code',
];

const processSteps = [
  {
    n: '01',
    title: 'SEED THE PETRI DISH',
    text: 'Start with a tiny premise, phrase, image, accusation, fake fact, math object, cryptid, or other conceptual irritant. It is not the song. It is the thing the machine has to grow around.',
  },
  {
    n: '02',
    title: 'INSTALL TEMPORARY MINDS',
    text: 'A cognitive stack changes how the system is allowed to reason: bureaucrat, sensory freak, taxonomy goblin, omission cartographer, memory mutant, and other little bastards with different jobs.',
  },
  {
    n: '03',
    title: 'BEND REALITY',
    text: 'Reality engines choose who is speaking, what world they inhabit, what headspace they have, how damaged or ecstatic the transmission is, and what kind of social situation the song thinks it is inside.',
  },
  {
    n: '04',
    title: 'ASSIGN MUSICAL JURISDICTIONS',
    text: 'Harmony, melody, rhythm, timbre, vocals, cast, technology, tuning, damage, scale, and constraints are given separate responsibilities. They negotiate instead of melting into generic genre soup.',
  },
  {
    n: '05',
    title: 'APPLY OPERATORS + PRESSURE',
    text: 'The useful weirdness is operational: hold one thing fixed while another migrates, delete a jurisdiction, force every lyric line to trigger an event, preserve an anchor while everything around it mutates.',
  },
  {
    n: '06',
    title: 'EXPORT THE SUNO TRIPTYCH',
    text: 'Each specimen resolves into STYLE, LYRICS / CONTROL, and CAPTION. The archive keeps the seed, stacks, fingerprints, metrics, character counts, and the exact prompt artifact that was sent onward.',
  },
];

const principles = [
  [
    'SEPARATE JURISDICTIONS',
    'Different musical dimensions keep different laws long enough to create productive friction.',
  ],
  [
    'ANCHOR UNDER SIEGE',
    'Something small stays recognizable while surrounding systems mutate, disappear, or contradict it.',
  ],
  [
    'CASTS, NOT BACKING VOCALS',
    'Voices can be hosts, mobs, witnesses, robots, choirs, hecklers, or isolated narrators with distinct structural jobs.',
  ],
  [
    'EVENT-DRIVEN FORM',
    'Instead of verse/chorus being the only clock, an error, buzzer, reveal, caller, collapse, or lyric can force the next musical event.',
  ],
  [
    'LEGIBLE WEIRDNESS',
    'The point is not random chaos. The strongest runs leave the nervous system one thing to grab while the rest of the machine misbehaves.',
  ],
  [
    'THE ARCHIVE IS THE EXPERIMENT',
    'Successes, failures, duplicates, weird dead ends, and mutation lineages all matter because the project is studying the process, not just collecting polished songs.',
  ],
];

function bytesLabel(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return 'Unknown archive error';
}

function escapeRegex(value: string) {
  const special = '\\^$.*+?()[]{}|';
  return value
    .split('')
    .map(char => (special.includes(char) ? '\\' + char : char))
    .join('');
}

function field(chunk: string, label: string) {
  const escaped = escapeRegex(label);
  const match = chunk.match(
    new RegExp('\\*\\*' + escaped + ':\\*\\*\\s*([^\\n]+)', 'i')
  );
  return match ? match[1].trim() : '';
}

function section(chunk: string, heading: string) {
  const escaped = escapeRegex(heading);
  const fence = '```';
  const match = chunk.match(
    new RegExp(
      '##\\s+' +
        escaped +
        '\\s*\\n\\s*' +
        fence +
        '(?:text)?\\s*\\n([\\s\\S]*?)' +
        fence,
      'i'
    )
  );
  return match ? match[1].trim() : '';
}

function parseRuns(content: string): RunRecord[] {
  const parts = content.split(/^# LITTLE GUY MACHINE — RUN\s*$/gm).slice(1);
  return parts
    .map(part => {
      const stack = field(part, 'Stack')
        .split('→')
        .map(item => item.trim())
        .filter(Boolean);
      const realityEngines = field(part, 'Reality engines')
        .split('→')
        .map(item => item.trim())
        .filter(Boolean);
      const compositionEngines = field(part, 'Composition engines')
        .split('→')
        .map(item => item.trim())
        .filter(Boolean);
      return {
        id: field(part, 'Run ID'),
        created: field(part, 'Created'),
        stack,
        realityEngines,
        compositionEngines,
        seed: field(part, 'Seed'),
        energy: field(part, 'Energy'),
        model: field(part, 'Model'),
        starred: field(part, 'Starred'),
        feedback: field(part, 'Feedback'),
        fingerprint: field(part, 'Musical fingerprint'),
        characterCounts: field(part, 'Character counts'),
        style: section(part, 'STYLE'),
        lyrics: section(part, 'LYRICS / CONTROL'),
        caption: section(part, 'CAPTION'),
        raw: part.trim(),
      };
    })
    .filter(run => run.id || run.seed || run.style || run.lyrics);
}

function fingerprintPieces(fingerprint: string) {
  if (!fingerprint) return [];
  return fingerprint
    .split('|')
    .map(piece => piece.trim())
    .filter(Boolean);
}

function engineColor(engine: string) {
  let value = 0;
  for (let i = 0; i < engine.length; i += 1)
    value = (value * 31 + engine.charCodeAt(i)) % 360;
  return 'hsl(' + value + ' 90% 68%)';
}

function SourceBox({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1100);
  }

  return (
    <div className="source-box">
      <div className="source-box-head">
        <span>{label}</span>
        <button type="button" className="tiny-button" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre>{text || 'No section found in this record.'}</pre>
    </div>
  );
}

function EngineTrail({
  items,
  empty = 'none recorded',
}: {
  items: string[];
  empty?: string;
}) {
  if (!items.length) return <div className="muted">{empty}</div>;
  return (
    <div className="engine-trail">
      {items.map((item, index) => (
        <div className="engine-segment" key={item + index}>
          <span
            className="engine-chip"
            style={{ borderColor: engineColor(item), color: engineColor(item) }}
          >
            {item}
          </span>
          {index < items.length - 1 && (
            <ChevronRight size={15} className="engine-arrow" />
          )}
        </div>
      ))}
    </div>
  );
}

function RunViewer({ run }: { run: RunRecord }) {
  const [tab, setTab] = useState<'style' | 'lyrics' | 'caption'>('style');
  const fp = fingerprintPieces(run.fingerprint);

  return (
    <div className="run-viewer">
      <div className="run-hero">
        <div>
          <div className="eyebrow">SPECIMEN {run.id || 'UNLABELED'}</div>
          <h2>{run.seed || 'Seed missing from record'}</h2>
          <div className="run-meta-row">
            {run.created && (
              <span>{new Date(run.created).toLocaleString()}</span>
            )}
            {run.energy && <span>ENERGY {run.energy}</span>}
            {run.model && <span>{run.model}</span>}
            {run.characterCounts && <span>{run.characterCounts}</span>}
          </div>
        </div>
        <div className="energy-orb" data-energy={run.energy || '0'}>
          <span>{run.energy || '?'}</span>
          <small>ENERGY</small>
        </div>
      </div>

      <div className="spec-grid">
        <section className="spec-panel">
          <div className="section-label">
            <Cpu size={15} /> COGNITIVE STACK
          </div>
          <EngineTrail items={run.stack} />
        </section>
        <section className="spec-panel">
          <div className="section-label">
            <Radio size={15} /> REALITY ENGINES
          </div>
          <EngineTrail items={run.realityEngines} />
        </section>
      </div>

      {run.compositionEngines.length > 0 && (
        <section className="spec-panel wide">
          <div className="section-label">
            <SlidersHorizontal size={15} /> COMPOSITION ENGINES ·{' '}
            {run.compositionEngines.length}
          </div>
          <div className="engine-cloud">
            {run.compositionEngines.map(item => (
              <span key={item} style={{ borderColor: engineColor(item) }}>
                {item}
              </span>
            ))}
          </div>
        </section>
      )}

      {fp.length > 0 && (
        <section className="spec-panel wide">
          <div className="section-label">
            <Activity size={15} /> MUSICAL FINGERPRINT
          </div>
          <div className="fingerprint-grid">
            {fp.map((piece, index) => {
              const split = piece.indexOf('=');
              const key =
                split > 0
                  ? piece.slice(0, split)
                  : index === 0
                    ? 'family'
                    : 'signal';
              const value = split > 0 ? piece.slice(split + 1) : piece;
              return (
                <div className="fingerprint-cell" key={piece + index}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="prompt-tabs">
        <button
          className={tab === 'style' ? 'active' : ''}
          onClick={() => setTab('style')}
        >
          STYLE
        </button>
        <button
          className={tab === 'lyrics' ? 'active' : ''}
          onClick={() => setTab('lyrics')}
        >
          LYRICS / CONTROL
        </button>
        <button
          className={tab === 'caption' ? 'active' : ''}
          onClick={() => setTab('caption')}
        >
          CAPTION
        </button>
      </div>
      {tab === 'style' && <SourceBox label="STYLE PROMPT" text={run.style} />}
      {tab === 'lyrics' && (
        <SourceBox label="LYRICS / CONTROL" text={run.lyrics} />
      )}
      {tab === 'caption' && <SourceBox label="CAPTION" text={run.caption} />}
    </div>
  );
}

function App() {
  const [payload, setPayload] = useState<ArchivePayload | null>(null);
  const [archiveError, setArchiveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'atlas' | 'method'>('atlas');
  const [kind, setKind] = useState<'all' | FileKind>('all');
  const [query, setQuery] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [selected, setSelected] = useState<ArchiveFile | null>(null);
  const [source, setSource] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [runIndex, setRunIndex] = useState(0);

  async function loadArchive() {
    setLoading(true);
    setArchiveError('');
    try {
      const response = await api.get('/api/archive');
      setPayload(response.data as ArchivePayload);
    } catch (err) {
      setArchiveError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadArchive();
  }, []);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const needle = query.trim().toLowerCase();
    return payload.files.filter(file => {
      if (!showEmpty && file.empty) return false;
      if (kind !== 'all' && file.kind !== kind) return false;
      if (needle && !file.path.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [payload, query, kind, showEmpty]);

  const runs = useMemo(() => parseRuns(source), [source]);
  const activeRun = runs[runIndex] || null;

  async function openFile(file: ArchiveFile) {
    if (file.kind === 'reference') {
      window.open(file.htmlUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setSelected(file);
    setSource('');
    setSourceError('');
    setRunIndex(0);
    setSourceLoading(true);
    try {
      const response = await api.get('/api/source', { path: file.path });
      setSource(String(response.data.content || ''));
    } catch (err) {
      setSourceError(errorMessage(err));
    } finally {
      setSourceLoading(false);
    }
  }

  function surpriseMe() {
    if (!payload) return;
    const choices = payload.files.filter(
      file => file.ext === 'md' && !file.empty
    );
    if (!choices.length) return;
    const choice = choices[Math.floor(Math.random() * choices.length)];
    void openFile(choice);
  }

  if (archiveError) {
    return (
      <main className="error-screen">
        <div className="error-glyph">×_×</div>
        <div className="eyebrow">
          GITHUB FEED / APP BACKEND / SOMETHING GOT WEIRD
        </div>
        <h1>Archive signal lost.</h1>
        <p>
          The exhibit could not pull the experiment index. The data is still
          safe in the repository; this view just failed to tune in.
        </p>
        <code>{archiveError}</code>
        <button className="primary-button" onClick={() => void loadArchive()}>
          <RefreshCw size={17} /> RETRY SIGNAL
        </button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <div className="noise" />
      <header className="topbar">
        <button className="brand" onClick={() => setMode('atlas')}>
          <span className="brand-orbit">
            <Atom size={25} />
          </span>
          <span>
            <strong>LIL GUYS // SUNO EXPERIMENT ATLAS</strong>
            <small>PUBLIC FIELD NOTES FROM THE PETRI DISH</small>
          </span>
        </button>
        <nav>
          <button
            className={mode === 'atlas' ? 'active' : ''}
            onClick={() => setMode('atlas')}
          >
            <Eye size={16} /> BROWSE THE DAMAGE
          </button>
          <button
            className={mode === 'method' ? 'active' : ''}
            onClick={() => setMode('method')}
          >
            <BookOpen size={16} /> HOW THIS MUTATES
          </button>
          <a
            href="https://github.com/merrypranxter/suno_experiment_data"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={16} /> SOURCE REPO
          </a>
        </nav>
      </header>

      {mode === 'method' ? (
        <main className="method-page">
          <section className="method-hero">
            <div className="eyebrow">WHAT THE FUCK IS HAPPENING HERE?</div>
            <h1>
              Not “AI makes a song.”
              <br />
              <em>A pile of rules learns how to argue.</em>
            </h1>
            <p>
              The Little Guy Machine is a composition notebook for deliberately
              mutating musical thought. The archive preserves the tiny seed, the
              cognitive and reality stacks, the composition engines, the
              constraints, the resulting musical fingerprint, and the exact
              Suno-facing prompt artifact.
            </p>
          </section>

          <section className="process-map">
            {processSteps.map(step => (
              <article key={step.n} className="process-card">
                <span className="process-number">{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </section>

          <section className="principles">
            <div className="section-kicker">
              <Sparkles size={17} /> RECURRING LAWS OF THE LAB
            </div>
            <div className="principle-grid">
              {principles.map(([title, text]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="method-bottom">
            <div>
              <div className="eyebrow">ONE SENTENCE VERSION</div>
              <h2>
                Give incompatible systems separate jobs, keep one thing legible,
                then make the consequences audible.
              </h2>
            </div>
            <button className="primary-button" onClick={() => setMode('atlas')}>
              <Zap size={17} /> ENTER THE ARCHIVE
            </button>
          </section>
        </main>
      ) : (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                LIVE INDEX OF merrypranxter/suno_experiment_data
              </div>
              <h1>THE SONG IS NOT THE ONLY SPECIMEN.</h1>
              <p>
                This is a browseable public lab notebook: seeds, temporary
                minds, reality engines, composition rules, failures, duplicates,
                fingerprints, and the three giant boxes eventually fed to Suno.
              </p>
              <div className="hero-actions">
                <button className="primary-button" onClick={surpriseMe}>
                  <Shuffle size={17} /> RANDOM SPECIMEN
                </button>
                <button
                  className="ghost-button"
                  onClick={() => setMode('method')}
                >
                  <BookOpen size={17} /> EXPLAIN THE MACHINE
                </button>
              </div>
            </div>
            <div className="orbital-diagram" aria-hidden="true">
              <div className="orbit orbit-a">
                <span>SEED</span>
              </div>
              <div className="orbit orbit-b">
                <span>MIND</span>
              </div>
              <div className="orbit orbit-c">
                <span>RHYTHM</span>
              </div>
              <div className="orb-core">
                SUNO
                <br />
                SLOP
              </div>
            </div>
          </section>

          <section className="telemetry">
            <div className="section-kicker">
              <Activity size={17} /> CORPUS TELEMETRY
            </div>
            {loading || !payload ? (
              <div className="loading-line">TUNING INTO REPOSITORY…</div>
            ) : (
              <div className="stat-grid">
                <div>
                  <strong>{payload.stats.files}</strong>
                  <span>TOTAL FILES</span>
                </div>
                <div>
                  <strong>{payload.stats.nonEmptyMarkdown}</strong>
                  <span>NON-EMPTY RECORDS</span>
                </div>
                <div>
                  <strong>{payload.stats.uniqueMarkdownBlobs}</strong>
                  <span>UNIQUE TEXT BLOBS</span>
                </div>
                <div>
                  <strong>{payload.stats.duplicateMarkdownCopies}</strong>
                  <span>DUPLICATE COPIES</span>
                </div>
                <div>
                  <strong>
                    {bytesLabel(payload.stats.totalMarkdownBytes)}
                  </strong>
                  <span>MARKDOWN MASS</span>
                </div>
                <div>
                  <strong>{payload.stats.pdfs}</strong>
                  <span>REFERENCE PDFs</span>
                </div>
              </div>
            )}
          </section>

          <section className="explorer">
            <div className="explorer-head">
              <div>
                <div className="section-kicker">
                  <FileText size={17} /> SPECIMEN CABINET
                </div>
                <h2>Pick through the experiment.</h2>
              </div>
              <div className="search-wrap">
                <Search size={17} />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="search filenames, dates, cursed little clues…"
                  aria-label="Search archive files"
                />
              </div>
            </div>

            <div className="filter-row">
              <div className="kind-filters">
                {kindOrder.map(item => (
                  <button
                    key={item}
                    className={kind === item ? 'active' : ''}
                    onClick={() => setKind(item)}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
              <label className="empty-toggle">
                <input
                  type="checkbox"
                  checked={showEmpty}
                  onChange={event => setShowEmpty(event.target.checked)}
                />
                SHOW EMPTY SHELLS
              </label>
            </div>

            <div className="result-line">
              <span>{filtered.length} visible files</span>
              {payload && (
                <span>
                  synced {new Date(payload.fetchedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="file-grid">
              {filtered.map(file => (
                <button
                  key={file.path}
                  className={'file-card kind-' + file.kind}
                  onClick={() => void openFile(file)}
                >
                  <div className="file-card-top">
                    <span className="kind-label">{file.kind}</span>
                    <span>{bytesLabel(file.size)}</span>
                  </div>
                  <h3>{file.path}</h3>
                  <div className="file-card-bottom">
                    <span>{file.date || file.ext.toUpperCase()}</span>
                    <span>
                      {file.empty ? 'EMPTY' : 'OPEN'} <ChevronRight size={14} />
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {!loading && filtered.length === 0 && (
              <div className="nothing-here">
                <div>¯\_(ツ)_/¯</div>
                <p>No specimen matches that combination of filters.</p>
              </div>
            )}
          </section>
        </main>
      )}

      {selected && (
        <div className="drawer-backdrop" onMouseDown={() => setSelected(null)}>
          <aside
            className="drawer"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <div className="eyebrow">
                  {selected.kind.toUpperCase()} · {bytesLabel(selected.size)}
                </div>
                <h2>{selected.path}</h2>
              </div>
              <div className="drawer-actions">
                <a
                  href={selected.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="tiny-button"
                >
                  <ExternalLink size={14} /> GITHUB
                </a>
                <button
                  className="icon-button"
                  onClick={() => setSelected(null)}
                  aria-label="Close specimen"
                >
                  <X size={19} />
                </button>
              </div>
            </div>

            {sourceLoading && (
              <div className="drawer-loading">
                <RefreshCw className="spin" /> DECODING SPECIMEN…
              </div>
            )}
            {sourceError && (
              <div className="source-error">
                <h3>This specimen would not open.</h3>
                <p>{sourceError}</p>
                <button
                  className="ghost-button"
                  onClick={() => void openFile(selected)}
                >
                  <RefreshCw size={16} /> TRY AGAIN
                </button>
              </div>
            )}

            {!sourceLoading &&
              !sourceError &&
              source &&
              (runs.length > 0 ? (
                <>
                  <div className="run-strip">
                    <span>
                      <Layers size={15} /> {runs.length} RUN
                      {runs.length === 1 ? '' : 'S'} IN THIS FILE
                    </span>
                    <div>
                      {runs.map((run, index) => (
                        <button
                          key={(run.id || 'run') + index}
                          className={runIndex === index ? 'active' : ''}
                          onClick={() => setRunIndex(index)}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </button>
                      ))}
                    </div>
                  </div>
                  {activeRun && <RunViewer run={activeRun} />}
                </>
              ) : (
                <div className="raw-record">
                  <div className="section-label">
                    <FileText size={15} /> RAW NOTE / CODE / NON-RUN RECORD
                  </div>
                  <pre>{source}</pre>
                </div>
              ))}
          </aside>
        </div>
      )}

      <footer>
        <span>
          THE LIL GUYS ARE NOT PEOPLE. THEY ARE PROCEDURAL TROUBLEMAKERS.
        </span>
        <a
          href="https://github.com/merrypranxter/suno_experiment_data"
          target="_blank"
          rel="noreferrer"
        >
          repo <ExternalLink size={13} />
        </a>
      </footer>
    </div>
  );
}

export default App;
