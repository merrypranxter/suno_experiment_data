const view = document.querySelector("#view");
const dock = document.querySelector("#dock");
const side = document.querySelector("#side-nav");
const NAV = [
  ["/", "Ledger"],
  ["/days", "Days"],
  ["/crew", "Crew"],
  ["/guide", "Guide"],
];

const state = { q: "", shelf: "", guy: "", starred: false, energy: false, notes: false, sort: "new" };
let ledger = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => {
  if (c === "&") return "&" + "amp;";
  if (c === "<") return "&" + "lt;";
  if (c === ">") return "&" + "gt;";
  if (c === '"') return "&" + "quot;";
  return "&" + "#39;";
});

function label(slug) {
  return String(slug)
    .split("-")
    .map((p) => (/^\d/.test(p) || p.length <= 2 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}
function shelfLabel(name) {
  return name === "Bigfoot Mothman lil guys suno h the ing" ? "Bigfoot / Mothman" : name;
}
function lines(seed) {
  const parts = String(seed).split(/\s*\/\/\s*/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : ["(no seed written down)"];
}
function pad(n) {
  return String(n).padStart(3, "0");
}
function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
function dayKey(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
function dayLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function fingerprint(fp) {
  const bits = String(fp).split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
  const jobs = [];
  const loose = [];
  for (const bit of bits) {
    const m = bit.match(/^([A-Za-z][\w /-]{0,40})=(.+)$/);
    if (m) jobs.push([m[1].trim(), m[2].trim()]);
    else loose.push(bit);
  }
  return { title: loose.join(" · "), jobs };
}
function pips(n) {
  if (!n) return "";
  return `<span class="pips" aria-label="Energy ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="pip${i <= n ? " on" : ""}"></i>`).join("")}</span>`;
}
function route() {
  const raw = (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "run" && parts[1]) return { name: "run", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "days") return { name: "days", day: parts[1] || "" };
  if (parts[0] === "crew") return { name: "crew" };
  if (parts[0] === "guide") return { name: "guide" };
  return { name: "ledger" };
}
function paintNav(name) {
  const html = NAV.map(([href, text]) => {
    const on = (name === "ledger" && href === "/") || (name !== "ledger" && href === `/${name}`);
    return `<a class="${on ? "on" : ""}" href="#${href}">${text}</a>`;
  }).join("");
  dock.innerHTML = html;
  side.innerHTML = NAV.map(([href, text]) => {
    const on = (name === "ledger" && href === "/") || (name !== "ledger" && href === `/${name}`);
    return `<a class="nav-link${on ? " on" : ""}" href="#${href}">${text}</a>`;
  }).join("");
}
function shelves() {
  const counts = new Map();
  for (const run of ledger.runs) for (const shelf of run.shelves) counts.set(shelf, (counts.get(shelf) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function filtered() {
  const q = state.q.trim().toLowerCase();
  const out = ledger.runs.filter((run) => {
    if (state.starred && !run.starred) return false;
    if (state.energy && run.energy !== 5) return false;
    if (state.notes && !run.feedback) return false;
    if (state.shelf === "untitled" && run.shelves.length) return false;
    if (state.shelf && state.shelf !== "untitled" && !run.shelves.includes(state.shelf)) return false;
    if (state.guy && ![...run.stack, ...run.reality, ...run.composition].includes(state.guy)) return false;
    if (!q) return true;
    const hay = [run.seed, run.fingerprint, run.lyricsHead, run.captionExcerpt, run.feedback, run.mouth, ...run.stack, ...run.shelves]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
  if (state.sort === "old") out.sort((a, b) => a.created.localeCompare(b.created));
  else if (state.sort === "energy") out.sort((a, b) => (b.energy ?? -1) - (a.energy ?? -1) || b.created.localeCompare(a.created));
  else if (state.sort === "long") out.sort((a, b) => b.lyricsLen - a.lyricsLen);
  else out.sort((a, b) => b.created.localeCompare(a.created));
  return out;
}
function card(run) {
  const shown = lines(run.seed).slice(0, 3);
  const fp = fingerprint(run.fingerprint).title;
  const crew = run.stack.slice(0, 3).map(label).join(" → ");
  return `<a class="slip card" href="#/run/${encodeURIComponent(run.id)}">
    <p class="meta">No. ${pad(run.no)} · ${esc(when(run.created))}${run.starred ? " · starred" : ""}</p>
    ${run.shelves[0] ? `<p class="kicker-deep">${esc(shelfLabel(run.shelves[0]))}</p>` : ""}
    ${shown.map((line) => `<h3>${esc(line)}</h3>`).join("")}
    ${fp ? `<p class="soft">${esc(fp)}</p>` : ""}
    ${run.feedback ? `<p class="note">“${esc(run.feedback)}”</p>` : ""}
    <p class="meta" style="margin-top:auto;padding-top:.8rem">${esc(crew)}${run.stack.length > 3 ? ` +${run.stack.length - 3}` : ""} ${pips(run.energy)}</p>
  </a>`;
}
function ledgerView() {
  const list = filtered();
  const shelfChips = shelves()
    .map(
      ([name, count]) =>
        `<button class="chip" data-shelf="${esc(name)}" aria-pressed="${state.shelf === name}">${esc(shelfLabel(name))} · ${count}</button>`,
    )
    .join("");
  const featured = ledger.runs
    .filter((r) => r.starred)
    .filter((r, i, arr) => arr.findIndex((x) => x.seed.trim().toLowerCase() === r.seed.trim().toLowerCase()) === i)
    .slice(0, 4);
  const idle = !state.q && !state.shelf && !state.guy && !state.starred && !state.energy && !state.notes && state.sort === "new";
  view.innerHTML = `
    <header class="slip">
      <p class="kicker-deep">Little Guy Machine · Sep 22 – Oct 2, 2026</p>
      <h1>My lil guys for Suno.</h1>
      <p class="lede">A reading room for the experiment, not the songs. A seed goes in. Named operators — the little guys — each keep a job. Out comes a blueprint you can paste into Suno.</p>
      <div class="stats">
        <div><span class="meta">Passes</span><b>${ledger.runs.length}</b></div>
        <div><span class="meta">Starred</span><b>${ledger.runs.filter((r) => r.starred).length}</b></div>
        <div><span class="meta">Little guys</span><b>${new Set(ledger.runs.flatMap((r) => r.stack)).size}</b></div>
        <div><span class="meta">Sessions</span><b>${new Set(ledger.runs.map((r) => r.sessionId).filter(Boolean)).size}</b></div>
      </div>
    </header>
    ${idle ? `<h2 style="margin:1.4rem 0 .6rem" class="muted">Start with the ones that got a star</h2><div class="row">${featured.map((r) => `<div style="width:18rem">${card(r)}</div>`).join("")}</div>` : ""}
    <div class="row" style="margin-top:1rem">${shelfChips}</div>
    <div style="margin-top:.8rem;display:grid;gap:.6rem">
      <input class="search" id="q" placeholder="Search seeds, crews, lyrics…" value="${esc(state.q)}" />
      <div class="wrap">
        <button class="chip" data-flag="starred" aria-pressed="${state.starred}">Starred</button>
        <button class="chip" data-flag="energy" aria-pressed="${state.energy}">Energy 5</button>
        <button class="chip" data-flag="notes" aria-pressed="${state.notes}">Notes</button>
        <button class="chip" data-shelf="untitled" aria-pressed="${state.shelf === "untitled"}">Untitled</button>
      </div>
      <div class="two">
        <select class="ctrl" id="sort" aria-label="Sort">
          ${["new", "old", "energy", "long"].map((v) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${{ new: "Newest", old: "Oldest", energy: "Energy", long: "Longest" }[v]}</option>`).join("")}
        </select>
        <button class="btn" id="clear" type="button">Clear</button>
      </div>
    </div>
    ${state.guy ? `<p class="kicker" style="margin-top:.8rem">Showing ${esc(label(state.guy))} · <a href="#/" id="clear-guy">clear</a></p>` : ""}
    <p class="muted" style="margin-top:1rem">${list.length} passes</p>
    <div class="grid cards">${list.map(card).join("") || `<p class="slip serif">Nothing in the ledger matches that.</p>`}</div>`;
  view.querySelector("#q").addEventListener("input", (e) => {
    state.q = e.target.value;
    ledgerView();
    view.querySelector("#q").focus();
  });
  view.querySelector("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    ledgerView();
  });
  view.querySelector("#clear").addEventListener("click", () => {
    Object.assign(state, { q: "", shelf: "", guy: "", starred: false, energy: false, notes: false, sort: "new" });
    ledgerView();
  });
  view.querySelectorAll("[data-shelf]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.shelf = state.shelf === btn.dataset.shelf ? "" : btn.dataset.shelf;
      ledgerView();
    }),
  );
  view.querySelectorAll("[data-flag]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state[btn.dataset.flag] = !state[btn.dataset.flag];
      ledgerView();
    }),
  );
}
function tally(pick) {
  const map = new Map();
  for (const run of ledger.runs) for (const slug of pick(run)) map.set(slug, (map.get(slug) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function bars(rows) {
  const max = rows[0]?.[1] || 1;
  return rows
    .map(
      ([slug, n]) => `<a class="crew-link" href="#/" data-guy="${esc(slug)}"><span>${esc(label(slug))}<b>${n}</b></span><span class="bar"><i><b style="width:${Math.max(6, Math.round((n / max) * 100))}%"></b></i></span></a>`,
    )
    .join("");
}
function crewView() {
  const stack = tally((r) => r.stack);
  const reality = tally((r) => r.reality);
  const composition = tally((r) => r.composition).slice(0, 24);
  view.innerHTML = `
    <p class="kicker">Who worked</p>
    <h1>The crew, and the jobs around them.</h1>
    <p class="lede">Little guys run the stack. Reality engines set the world. Composition engines are the musical jurisdictions. Pick one to see every pass it touched.</p>
    <h2 style="margin-top:1.6rem">Little guys</h2>
    ${bars(stack)}
    <h2 style="margin-top:1.6rem">Reality</h2>
    ${bars(reality)}
    <h2 style="margin-top:1.6rem">Busiest jurisdictions</h2>
    ${bars(composition)}`;
  view.querySelectorAll("[data-guy]").forEach((a) =>
    a.addEventListener("click", () => {
      state.guy = a.dataset.guy;
    }),
  );
}
function daysView(day) {
  const groups = new Map();
  for (const run of ledger.runs) {
    const key = dayKey(run.created);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const days = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  view.innerHTML = `
    <p class="kicker">The month, in order</p>
    <h1>${days.length} days of passes.</h1>
    <p class="lede">Loose blurts first. Named piles show up as the exports get titles.</p>
    <div class="row" style="margin:1rem 0">${days.map(([key]) => `<a class="chip" href="#/days/${key}">${dayLabel(key)}</a>`).join("")}</div>
    ${days
      .map(([key, runs]) => {
        return `<section id="day-${key}" style="margin-top:1.6rem"><h2>${dayLabel(key)}</h2><p class="muted">${runs.length} passes</p>
        ${runs
          .map(
            (run) => `<a class="day-row" href="#/run/${encodeURIComponent(run.id)}"><span class="muted">${pad(run.no)}</span><em>${esc(lines(run.seed)[0])}</em>${pips(run.energy)}</a>`,
          )
          .join("")}
        </section>`;
      })
      .join("")}`;
  if (day) document.getElementById(`day-${day}`)?.scrollIntoView();
}
function guideView() {
  const named = [
    ["Morning", "Morning"],
    ["Bigfoot Mothman lil guys suno h the ing", "Bigfoot / Mothman"],
    ["Long lil guys today", "Long lil guys today"],
    ["LOSE EVERYTHING", "LOSE EVERYTHING"],
    ["Why am I like this", "Why am I like this"],
    ["Cats", "Cats"],
    ["Weird vibration", "Weird vibration"],
  ];
  view.innerHTML = `
    <p class="kicker">Field guide</p>
    <h1>How a pass actually works.</h1>
    <p class="lede">Give musical dimensions separate jurisdictions, make their interaction operational, and let an anchor survive the change.</p>
    ${[
      ["Seed", "The human line. Often several blurts split by //. It is the only part that is not staffed out."],
      ["Crew", "The stack. Ordered little guys. The archive keeps the order they ran, not their private instructions. A name here is a job title."],
      ["Reality", "Optional engines for the world the song thinks it is inside. A chaos number says how hard those worlds argue."],
      ["Jurisdictions", "A tuning, a drum, a language, a constraint, a failure. Do not melt them into genre soup."],
      ["Blueprint", "Style is the sound-world. Lyrics / control is the score. Caption is the machine summarizing itself. Bracket lines in the lyrics are cues."],
    ]
      .map(([t, b], i) => `<article class="step"><p class="kicker">0${i + 1}</p><h2>${t}</h2><p class="lede">${b}</p></article>`)
      .join("")}
    <h2 style="margin-top:1.6rem">Named piles</h2>
    <div class="wrap" style="margin-top:.6rem">${named.map(([shelf, text]) => `<a class="chip" href="#/" data-shelf="${esc(shelf)}">${esc(text)}</a>`).join("")}</div>
    <article class="slip" style="margin-top:1.2rem"><h2>What this is not</h2><p>Not a player. No audio lives here. Copy style and lyrics into Suno. ${ledger.runs.length} run ids were recovered from overlapping exports.</p></article>`;
  view.querySelectorAll("[data-shelf]").forEach((a) =>
    a.addEventListener("click", () => {
      state.shelf = a.dataset.shelf;
    }),
  );
}
async function runView(id) {
  const meta = ledger.runs.find((r) => r.id === id);
  if (!meta) {
    view.innerHTML = `<h1>That pass isn’t in the ledger.</h1><p><a class="kicker" href="#/">Back</a></p>`;
    return;
  }
  view.innerHTML = `<p class="muted">Opening the blueprint…</p>`;
  const body = await fetch(`./data/runs/${encodeURIComponent(id)}.json`).then((r) => r.json());
  const fp = fingerprint(meta.fingerprint);
  const chips = (slugs) => slugs.map((slug) => `<a class="chip" href="#/" data-guy="${esc(slug)}">${esc(label(slug))}</a>`).join("");
  view.innerHTML = `
    <p><a class="muted" href="#/">← Ledger</a></p>
    <p class="meta">No. ${pad(meta.no)} · ${esc(when(meta.created))}${meta.starred ? " · starred" : ""}</p>
    <h1>${lines(meta.seed).map(esc).join("<br>")}</h1>
    ${meta.feedback ? `<blockquote class="slip note">“${esc(meta.feedback)}”</blockquote>` : ""}
    ${fp.title ? `<p class="serif" style="font-size:1.3rem">${esc(fp.title)}</p>` : ""}
    <dl class="jobs">${fp.jobs.map(([k, v]) => `<div class="job"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    <h2 style="margin-top:1.4rem">Crew</h2>
    <div class="wrap" style="margin-top:.5rem">${chips(meta.stack)}</div>
    ${meta.reality.length ? `<h2 style="margin-top:1.2rem">Reality</h2><div class="wrap" style="margin-top:.5rem">${chips(meta.reality)}</div>` : ""}
    ${meta.mouth ? `<p class="muted" style="margin-top:1rem">Mouth · ${esc(meta.mouth)}</p>` : ""}
    <div class="wrap" style="margin-top:1.2rem">
      <button class="btn" id="copy-both" style="background:var(--signal);color:var(--signal-ink)">Copy style & lyrics</button>
      <button class="btn" id="copy-all">Copy all</button>
    </div>
    ${sheet("Style", body.style, "style")}
    ${sheet("Lyrics / control", score(body.lyrics), "lyrics", true)}
    ${sheet("Caption", body.caption, "caption")}`;
  const copy = async (text, btn) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 1200);
  };
  view.querySelector("#copy-both").addEventListener("click", (e) => copy(`STYLE\n${body.style}\n\nLYRICS\n${body.lyrics}`, e.currentTarget));
  view.querySelector("#copy-all").addEventListener("click", (e) =>
    copy(`SEED\n${meta.seed}\n\nSTYLE\n${body.style}\n\nLYRICS / CONTROL\n${body.lyrics}\n\nCAPTION\n${body.caption}`, e.currentTarget),
  );
  view.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", () => copy(body[btn.dataset.copy], btn)));
  view.querySelectorAll("[data-guy]").forEach((a) => a.addEventListener("click", () => (state.guy = a.dataset.guy)));
}
function sheet(title, html, key, trusted = false) {
  return `<article class="slip sheet"><header><h2 style="font-size:1rem">${title}</h2><button class="btn" data-copy="${key}" style="background:var(--ink);color:var(--paper)">Copy</button></header>${trusted ? html : `<pre>${esc(html)}</pre>`}</article>`;
}
function score(text) {
  return `<div class="prose">${String(text)
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "<br>";
      const cue = line.trim().startsWith("[");
      return `<div class="${cue ? "cue" : ""}">${esc(line)}</div>`;
    })
    .join("")}</div>`;
}
async function render() {
  const here = route();
  paintNav(here.name);
  if (here.name === "ledger") ledgerView();
  else if (here.name === "days") daysView(here.day);
  else if (here.name === "crew") crewView();
  else if (here.name === "guide") guideView();
  else await runView(here.id);
  if (!here.day) window.scrollTo(0, 0);
}
const data = await fetch("./data/ledger.json").then((r) => r.json());
ledger = data;
document.querySelector("#side-foot").textContent = `${ledger.runs.length} passes\nSep 22 – Oct 2, 2026`;
window.addEventListener("hashchange", () => {
  void render();
});
void render();
