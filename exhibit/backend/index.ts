import { error, json, router } from '@appdeploy/sdk';

const OWNER = 'merrypranxter';
const REPO = 'suno_experiment_data';
const BRANCH = 'main';
const TREE_URL =
  'https://api.github.com/repos/' +
  OWNER +
  '/' +
  REPO +
  '/git/trees/' +
  BRANCH +
  '?recursive=1';

interface GitTreeItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

interface GitTreeResponse {
  tree: GitTreeItem[];
}

let archiveCache: { at: number; payload: unknown } | null = null;

function extension(path: string) {
  const match = path.match(/\.([^.\/]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function classify(path: string) {
  const ext = extension(path);
  const lower = path.toLowerCase();
  if (ext === 'pdf') return 'reference';
  if (
    lower.startsWith('little_guy/') ||
    lower.startsWith('tests/') ||
    ['py', 'js', 'html', 'css'].includes(ext)
  )
    return 'code';
  if (lower.includes('little-guy-run-')) return 'run';
  if (lower.includes('little-guy-session-')) return 'session';
  if (lower.includes('archive')) return 'archive';
  return 'notes';
}

function dateFromPath(path: string) {
  const match = path.match(/2026-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function githubHtmlUrl(path: string) {
  const encoded = path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return (
    'https://github.com/' +
    OWNER +
    '/' +
    REPO +
    '/blob/' +
    BRANCH +
    '/' +
    encoded
  );
}

async function getArchivePayload() {
  if (archiveCache && Date.now() - archiveCache.at < 10 * 60 * 1000)
    return archiveCache.payload;

  const response = await fetch(TREE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lil-guys-experiment-atlas',
    },
  });

  if (!response.ok)
    throw new Error('GitHub tree request failed with ' + response.status);

  const data = (await response.json()) as GitTreeResponse;
  const blobs = data.tree.filter(item => item.type === 'blob');
  const files = blobs
    .map(item => {
      const ext = extension(item.path);
      const size = item.size || 0;
      return {
        path: item.path,
        sha: item.sha,
        size,
        ext,
        kind: classify(item.path),
        date: dateFromPath(item.path),
        empty: size === 0,
        htmlUrl: githubHtmlUrl(item.path),
      };
    })
    .sort((a, b) => {
      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare !== 0) return dateCompare;
      return a.path.localeCompare(b.path);
    });

  const markdown = files.filter(file => file.ext === 'md');
  const nonEmptyMarkdown = markdown.filter(file => !file.empty);
  const uniqueMarkdownBlobs = new Set(nonEmptyMarkdown.map(file => file.sha))
    .size;
  const payload = {
    repo: OWNER + '/' + REPO,
    branch: BRANCH,
    fetchedAt: new Date().toISOString(),
    files,
    stats: {
      files: files.length,
      markdown: markdown.length,
      nonEmptyMarkdown: nonEmptyMarkdown.length,
      uniqueMarkdownBlobs,
      duplicateMarkdownCopies: nonEmptyMarkdown.length - uniqueMarkdownBlobs,
      totalMarkdownBytes: nonEmptyMarkdown.reduce(
        (sum, file) => sum + file.size,
        0
      ),
      pdfs: files.filter(file => file.ext === 'pdf').length,
      codeFiles: files.filter(file => file.kind === 'code').length,
    },
  };

  archiveCache = { at: Date.now(), payload };
  return payload;
}

async function getTextFile(path: string) {
  if (!path || path.includes('..') || path.startsWith('/'))
    throw new Error('Invalid path');
  const ext = extension(path);
  if (!['md', 'py', 'js', 'html', 'css'].includes(ext))
    throw new Error('This file type is opened on GitHub instead.');
  const encoded = path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  const url =
    'https://raw.githubusercontent.com/' +
    OWNER +
    '/' +
    REPO +
    '/' +
    BRANCH +
    '/' +
    encoded;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'lil-guys-experiment-atlas' },
  });
  if (!response.ok)
    throw new Error('Raw file request failed with ' + response.status);
  return response.text();
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/archive': [
    async () => {
      try {
        return json(await getArchivePayload());
      } catch (err) {
        console.error('archive index failed', err);
        return error('archive_index_unavailable', 502);
      }
    },
  ],
  'GET /api/source': [
    async ({ query }) => {
      try {
        const path = query.path || '';
        const content = await getTextFile(path);
        return json({ path, content });
      } catch (err) {
        console.warn('source fetch failed', err);
        return error(
          err instanceof Error ? err.message : 'source_unavailable',
          502
        );
      }
    },
  ],
});
