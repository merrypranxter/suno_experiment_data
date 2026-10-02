const view = document.querySelector('#main-view');
const toastElement = document.querySelector('#toast');
const pageNames = { library: 'Library', favorites: 'Starred', compose: 'New composition', detail: 'Run details' };
let currentView = 'library';
let selectedRun = null;
let starredOnly = false;
let searchText = '';
let allEngines = [];
let previewTimer;
let toastTimer;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function notify(message) {
  toastElement.textContent = message;
  toastElement.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove('visible'), 2600);
}

function setView(nextView) {
  currentView = nextView;
  document.querySelector('#current-section').textContent = pageNames[nextView] || pageNames.library;
  document.querySelectorAll('[data-view-link]').forEach((button) => {
    button.classList.toggle('active', button.dataset.viewLink === nextView);
  });
  if (nextView === 'compose') renderComposer();
  else if (nextView === 'detail' && selectedRun) renderDetail(selectedRun);
  else renderLibrary();
}

function formatDate(value) {
  if (!value) return 'Date not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? escapeHtml(value)
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function titleFor(run) {
  return (run.title || run.seed || 'Untitled composition').replace(/\s+/g, ' ').trim();
}

function sourceName(run) {
  return run.prompt ? 'Prompt experiment' : (run.source_path || 'Imported archive');
}

function previewFor(run) {
  return run.fingerprint || run.style || run.prompt || run.seed || 'No composition notes were saved for this run.';
}

function renderRunCard(run) {
  const engines = [...(run.reality_engines || []), ...(run.composition_engines || [])];
  const chips = engines.slice(0, 3).map((engine, index) =>
    `<span class="chip ${index === 0 ? 'chip-violet' : ''}">${escapeHtml(engine)}</span>`).join('');
  const source = sourceName(run);
  return `
    <article class="run-card" role="button" tabindex="0" data-open-run="${escapeHtml(run.id)}" aria-label="Open ${escapeHtml(titleFor(run))}">
      <div class="run-card-top">
        <div>
          <span class="source-label"><span class="source-dot ${run.prompt ? 'generated' : ''}"></span>${escapeHtml(source)}</span>
          <h3 class="run-title">${escapeHtml(titleFor(run))}</h3>
          <span class="run-meta">${escapeHtml(formatDate(run.created))}${run.energy ? ` · Energy ${escapeHtml(run.energy)}/5` : ''}${run.model ? ` · ${escapeHtml(run.model)}` : ''}</span>
        </div>
        <button class="star-button ${run.starred ? 'starred' : ''}" data-star-run="${escapeHtml(run.id)}" aria-label="${run.starred ? 'Unstar' : 'Star'} run" title="${run.starred ? 'Unstar run' : 'Star run'}">${run.starred ? '★' : '☆'}</button>
      </div>
      <p class="run-preview">${escapeHtml(previewFor(run)).slice(0, 290)}${String(previewFor(run)).length > 290 ? '…' : ''}</p>
      <div class="run-card-bottom"><div class="chip-row">${chips || '<span class="chip">No operators recorded</span>'}</div>
        <span class="run-meta">${engines.length ? `${engines.length} systems` : 'Open run'}　↗</span>
      </div>
    </article>`;
}

async function renderLibrary() {
  view.innerHTML = '<div class="loading-state"><span class="spinner"></span> Finding your little guys…</div>';
  try {
    const params = new URLSearchParams({ q: searchText, limit: '500' });
    if (currentView === 'favorites' || starredOnly) params.set('starred', 'true');
    const [runs, stats] = await Promise.all([
      request(`/api/runs?${params}`),
      request('/api/stats'),
    ]);
    const isFavorites = currentView === 'favorites' || starredOnly;
    const cards = runs.map(renderRunCard).join('');
    view.innerHTML = `
      <section class="hero-row">
        <div>
          <span class="eyebrow">A LITTLE COMPOSITION LAB</span>
          <h1>Make the strange<br>make sense.</h1>
          <p class="page-subtitle">A growing archive of musical experiments—and a place to build the next one. Give every system its own jurisdiction. Keep one small thing alive.</p>
        </div>
        <button class="button button-dark" data-view-link="compose">＋ Compose a new run</button>
      </section>
      <section class="stats-row" aria-label="Library summary">
        ${statCard('EXPERIMENTS', stats.runs, 'archived + new')}
        ${statCard('SESSIONS', stats.sessions, 'creative threads')}
        ${statCard('STARRED', stats.starred, 'keepers & clues')}
        ${statCard('SOURCE ARCHIVES', stats.archives, 'Markdown imports')}
      </section>
      <section>
        <div class="list-heading"><h2>${isFavorites ? 'Starred experiments' : 'Recent experiments'}</h2><span>${runs.length} SHOWN · ${stats.runs} TOTAL</span></div>
        <div class="search-row">
          <label class="search-box"><input id="run-search" type="search" placeholder="Search seeds, styles, operators…" value="${escapeHtml(searchText)}" aria-label="Search experiments"></label>
          <button class="filter-button" id="toggle-starred" aria-pressed="${isFavorites}">${isFavorites ? '★ Starred' : '☷ All experiments'}</button>
        </div>
        <div class="run-list">${cards || emptyState(isFavorites)}</div>
      </section>`;
    const search = view.querySelector('#run-search');
    search.addEventListener('input', () => {
      searchText = search.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderLibrary, 180);
    });
    view.querySelector('#toggle-starred').addEventListener('click', () => {
      if (currentView === 'favorites') setView('library');
      else {
        starredOnly = !starredOnly;
        renderLibrary();
      }
    });
  } catch (error) {
    renderError(error);
  }
}

let searchTimer;
function statCard(label, number, detail) {
  return `<div class="stat-card"><span class="stat-label">${escapeHtml(label)}</span><strong class="stat-number">${escapeHtml(number)}</strong><span class="stat-detail">${escapeHtml(detail)}</span></div>`;
}

function emptyState(isFavorites) {
  return `<div class="empty-state"><strong>${isFavorites ? 'No stars yet.' : 'A blank page is a good beginning.'}</strong>
    <p>${isFavorites ? 'Star a run when a compositional mechanism surprises you.' : 'Your imported archives will appear here. Or make a first prompt from scratch.'}</p>
    ${isFavorites ? '' : '<button class="button button-lime" data-view-link="compose">Start a composition</button>'}</div>`;
}

function renderError(error) {
  view.innerHTML = `<div class="empty-state"><strong>Could not open the composition library.</strong><p>${escapeHtml(error.message)}</p><button class="button button-light" id="retry">Try again</button></div>`;
  view.querySelector('#retry')?.addEventListener('click', renderLibrary);
}

function renderComposer() {
  const suggestions = allEngines.slice(0, 600).map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
  view.innerHTML = `
    <section>
      <span class="eyebrow">DESIGN THE RULES, NOT JUST THE VIBE</span>
      <h1>Start a new<br>little universe.</h1>
      <p class="page-subtitle">Give each musical system a job. Let the tension between them create the surprise.</p>
    </section>
    <form id="composition-form" class="compose-grid">
      <div class="panel composer-panel">
        <div class="panel-title"><div><span class="eyebrow">COMPOSITION BLUEPRINT</span><h2>Set the governing rules</h2><p>Only the seed is required. Add detail where it matters.</p></div><span class="chip chip-lime">01 / COMPOSE</span></div>
        <div class="form-section">
          <div class="form-heading"><span>1</span><h3>Seed &amp; energy</h3><small>the thing to transform</small></div>
          <div class="field"><label for="seed">Seed / subject <span aria-hidden="true">*</span></label><textarea id="seed" name="seed" required maxlength="4000" placeholder="The existential horror of waking up trapped in a sticky biological machine…"></textarea></div>
          <div class="field-grid">
            <div class="field"><label for="session-title">Session name</label><input id="session-title" name="session_title" maxlength="120" placeholder="A name for this thread"></div>
            <div class="field"><label for="model">Model note</label><input id="model" name="model" list="model-options" placeholder="Choose later in Suno"><datalist id="model-options"><option value="gemini-3.5-flash-lite"><option value="procedural-synthesizer"></datalist></div>
          </div>
          <div class="field">
            <label for="energy">Energy</label>
            <div class="energy-control"><input id="energy" name="energy" type="range" min="1" max="5" value="3"><span class="energy-display" id="energy-value">3 / 5</span></div>
            <span class="field-hint">Intensity of delivery, not a substitute for event density.</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-heading"><span>2</span><h3>Separate jurisdictions</h3><small>each gets its own law</small></div>
          <datalist id="engine-options">${suggestions}</datalist>
          <div class="field-grid">
            ${dimensionField('harmony', 'Harmony', 'Owns chord movement, tension, and resolution.')}
            ${dimensionField('melody', 'Melody', 'Owns contour, phrase shape, and ornament.')}
            ${dimensionField('rhythm', 'Rhythm', 'Owns pulse, subdivision, interruption, density.')}
            ${dimensionField('timbre', 'Timbre / atmosphere', 'Owns sound sources, texture, and space.')}
            ${dimensionField('vocals', 'Vocal behavior', 'Owns delivery, cast, language, and articulation.')}
            ${dimensionField('performance', 'Performance attitude', 'Owns physicality, intention, and contrast.')}
          </div>
          <div class="field"><label for="anchor">Anchor / invariant</label><input id="anchor" name="anchor" placeholder="A three-note whistle that survives every transformation"><span class="field-hint">A pulse, bass pocket, phrase, narrator, or tiny recognizable riff gives the listener something to hold.</span></div>
        </div>

        <div class="form-section">
          <div class="form-heading"><span>3</span><h3>Operators &amp; interactions</h3><small>make the weirdness operational</small></div>
          <div class="starter-row">
            <button type="button" class="starter-chip" data-starter="ANCHOR UNDER SIEGE — keep one tiny invariant recognizable while surrounding systems mutate.">Anchor under siege</button>
            <button type="button" class="starter-chip" data-starter="PANIC ENGINE — increase the arrival rate of identifiable musical events before earlier events settle.">Panic engine</button>
            <button type="button" class="starter-chip" data-starter="EVENT-DRIVEN VARIETY SHOW — each entrance, interruption, or system failure causes a specific arrangement response.">Event-driven form</button>
          </div>
          <div class="field"><label for="operators">Composition operators</label><textarea class="short" id="operators" name="operators" placeholder="One transformation per line. Example: Keep the harmony still while the pulse density doubles."></textarea><span class="field-hint">Hold, migrate, compress, remove, infect, interrupt, recall, or transform a rule for a concrete reason.</span></div>
          <div class="field-grid">
            <div class="field"><label for="cast">Cast &amp; role ownership</label><textarea class="short" id="cast" name="cast" placeholder="One dry narrator; a crowd that joins in stages; a band that hard-stops on cue."></textarea></div>
            <div class="field"><label for="arrangement">Event-driven arrangement</label><textarea class="short" id="arrangement" name="arrangement" placeholder="What happens, what responds, and what changes next?"></textarea></div>
          </div>
          <div class="field"><label for="constraints">Constraints / forbidden shortcuts</label><textarea class="short" id="constraints" name="constraints" placeholder="No genre soup. Keep each musical job distinct; no decorative glitch language."></textarea></div>
        </div>
        <div class="form-actions"><button type="button" class="button button-light" data-view-link="library">Cancel</button><button class="button button-dark" type="submit">Save composition prompt <span>↗</span></button></div>
      </div>

      <aside class="panel prompt-panel">
        <div class="prompt-head"><div><h2>Prompt blueprint</h2><small>LIVE PREVIEW · READY FOR SUNO</small></div><span aria-hidden="true">✳</span></div>
        <div class="prompt-body"><p class="prompt-intro">This app prepares structured instructions. Paste the blueprint into your chosen music model; audio generation stays in Suno.</p>
          <pre class="prompt-preview" id="prompt-preview">Add a seed to start building your composition blueprint.</pre>
          <div class="prompt-actions"><button type="button" class="button button-light" id="copy-preview">Copy blueprint</button><button type="button" class="button button-lime" id="refresh-preview">Refresh preview</button></div>
        </div>
      </aside>
    </form>`;

  const form = view.querySelector('#composition-form');
  const preview = view.querySelector('#prompt-preview');
  const refresh = async () => {
    const payload = formPayload(form);
    if (!payload.seed.trim()) {
      preview.textContent = 'Add a seed to start building your composition blueprint.';
      return;
    }
    try {
      const response = await request('/api/preview', { method: 'POST', body: JSON.stringify(payload) });
      preview.textContent = response.prompt;
    } catch (error) {
      preview.textContent = error.message;
    }
  };
  form.addEventListener('input', () => {
    view.querySelector('#energy-value').textContent = `${form.elements.energy.value} / 5`;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refresh, 220);
  });
  view.querySelector('#refresh-preview').addEventListener('click', refresh);
  view.querySelector('#copy-preview').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(preview.textContent);
      notify('Blueprint copied.');
    } catch {
      notify('Copy is unavailable in this browser. Select the blueprint to copy it.');
    }
  });
  view.querySelectorAll('[data-starter]').forEach((button) => button.addEventListener('click', () => {
    const textarea = form.elements.operators;
    const text = button.dataset.starter;
    const existing = textarea.value.split('\n');
    if (existing.includes(text)) {
      textarea.value = existing.filter((line) => line !== text).join('\n');
      button.classList.remove('selected');
    } else {
      textarea.value = [...existing.filter(Boolean), text].join('\n');
      button.classList.add('selected');
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      selectedRun = await request('/api/runs', { method: 'POST', body: JSON.stringify(formPayload(form)) });
      notify('Prompt saved to your local library.');
      setView('detail');
    } catch (error) {
      notify(error.message);
      submit.disabled = false;
      submit.innerHTML = 'Save composition prompt <span>↗</span>';
    }
  });
  refresh();
}

function dimensionField(key, label, hint) {
  return `<div class="field"><label for="dimension-${key}">${escapeHtml(label)}</label>
    <textarea class="short" id="dimension-${key}" name="dimension-${key}" list="engine-options" placeholder="${escapeHtml(hint)}"></textarea></div>`;
}

function formPayload(form) {
  const data = new FormData(form);
  const dimensions = {};
  ['harmony', 'melody', 'rhythm', 'timbre', 'vocals', 'performance'].forEach((key) => {
    dimensions[key] = data.get(`dimension-${key}`) || '';
  });
  return {
    seed: data.get('seed') || '',
    energy: Number(data.get('energy') || 3),
    model: data.get('model') || '',
    session_title: data.get('session_title') || '',
    dimensions,
    anchor: data.get('anchor') || '',
    operators: data.get('operators') || '',
    cast: data.get('cast') || '',
    arrangement: data.get('arrangement') || '',
    constraints: data.get('constraints') || '',
  };
}

function renderDetail(run) {
  const isNew = Boolean(run.prompt);
  const engines = [...(run.reality_engines || []), ...(run.composition_engines || [])];
  const metrics = Object.entries(run.metrics || {}).map(([name, value]) =>
    `<span class="chip">${escapeHtml(name)} ${escapeHtml(value)}</span>`).join('');
  const promptBox = run.prompt
    ? `<div class="detail-box full"><h3>Composition prompt · copy into Suno</h3><pre class="prompt-preview">${escapeHtml(run.prompt)}</pre><div class="prompt-actions"><button class="button button-light" id="copy-run-prompt">Copy blueprint</button><a class="button button-light" href="/api/runs/${encodeURIComponent(run.id)}/export">Export Markdown</a></div></div>`
    : `<div class="detail-box full"><h3>Imported source</h3><p class="run-meta">${escapeHtml(run.source_path || 'Markdown archive')}</p><div class="chip-row">${metrics}${engines.map((engine) => `<span class="chip">${escapeHtml(engine)}</span>`).join('')}</div></div>`;
  view.innerHTML = `
    <div class="detail-top">
      <div><span class="eyebrow">${isNew ? 'PROMPT EXPERIMENT' : 'ARCHIVED COMPOSITION'}</span>
        <h1>${escapeHtml(titleFor(run))}</h1>
        <div class="detail-meta"><span>${escapeHtml(formatDate(run.created))}</span>${run.energy ? `<span>Energy ${escapeHtml(run.energy)}/5</span>` : ''}${run.model ? `<span>${escapeHtml(run.model)}</span>` : ''}${run.session_id ? `<span>${escapeHtml(run.session_id)}</span>` : ''}</div>
      </div>
      <div class="detail-actions"><button class="button button-light" id="detail-star">${run.starred ? '★ Starred' : '☆ Star run'}</button><a class="button button-light" href="/api/runs/${encodeURIComponent(run.id)}/export">Export .md</a></div>
    </div>
    <div class="detail-grid">
      ${promptBox}
      ${!isNew && run.style ? detailBox('Style', run.style) : ''}
      ${!isNew && run.lyrics ? detailBox('Lyrics / control', run.lyrics) : ''}
      ${!isNew && run.caption ? detailBox('Caption', run.caption) : ''}
      ${run.fingerprint ? detailBox('Musical fingerprint', run.fingerprint) : ''}
    </div>
    <section class="panel feedback-panel"><h3>What did this experiment teach you?</h3><p>Keep the mechanism, not just “I liked it.” Record what caused the interesting result.</p>
      <textarea id="run-feedback" maxlength="4000" placeholder="The deadpan narrator stayed stable while the crowd became increasingly rhythmic…">${escapeHtml(run.feedback)}</textarea>
      <div class="feedback-bottom"><input id="run-tags" maxlength="1000" placeholder="Feedback tags, separated by commas" value="${escapeHtml((run.tags || []).join(', '))}"><button class="button button-dark button-small" id="save-feedback">Save notes</button></div>
    </section>`;
  view.querySelector('#detail-star').addEventListener('click', async () => {
    try {
      selectedRun = await request(`/api/runs/${encodeURIComponent(run.id)}`, {
        method: 'PATCH', body: JSON.stringify({ starred: !run.starred }),
      });
      renderDetail(selectedRun);
      notify(selectedRun.starred ? 'Added to starred experiments.' : 'Removed from starred experiments.');
    } catch (error) { notify(error.message); }
  });
  view.querySelector('#save-feedback').addEventListener('click', async () => {
    try {
      selectedRun = await request(`/api/runs/${encodeURIComponent(run.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ feedback: view.querySelector('#run-feedback').value, tags: view.querySelector('#run-tags').value }),
      });
      notify('Notes saved.');
    } catch (error) { notify(error.message); }
  });
  view.querySelector('#copy-run-prompt')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(run.prompt);
      notify('Blueprint copied.');
    } catch { notify('Copy is unavailable in this browser.'); }
  });
}

function detailBox(title, content) {
  return `<div class="detail-box"><h3>${escapeHtml(title)}</h3><pre>${escapeHtml(content)}</pre></div>`;
}

async function openRun(runId) {
  try {
    selectedRun = await request(`/api/runs/${encodeURIComponent(runId)}`);
    if (selectedRun) setView('detail');
  } catch (error) { notify(error.message); }
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view-link]');
  if (viewButton) {
    event.preventDefault();
    starredOnly = false;
    setView(viewButton.dataset.viewLink);
    return;
  }
  const star = event.target.closest('[data-star-run]');
  if (star) {
    event.preventDefault();
    event.stopPropagation();
    const runId = star.dataset.starRun;
    const run = request(`/api/runs/${encodeURIComponent(runId)}`).then((record) =>
      request(`/api/runs/${encodeURIComponent(runId)}`, {
        method: 'PATCH', body: JSON.stringify({ starred: !record.starred }),
      })).then(() => renderLibrary()).catch((error) => notify(error.message));
    return run;
  }
  const card = event.target.closest('[data-open-run]');
  if (card) openRun(card.dataset.openRun);
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open-run]')) {
    event.preventDefault();
    openRun(event.target.dataset.openRun);
  }
});

async function start() {
  try {
    allEngines = await request('/api/engines');
  } catch { allEngines = []; }
  setView('library');
}

start();
