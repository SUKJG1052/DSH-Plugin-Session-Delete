// dsh-chameleon workbench-session-delete: delete-session capability (Host half).
//
// Deletes one session end-to-end on the host:
//   POST /__chameleon/session/delete  - HTTP endpoint for the client button
//   workbench_session_delete          - model tool for edit mode
//   workbench_session_gc              - maintenance tool for pre-existing residue
//
// Deletion steps, kept consistent with the LIVE storage services so the
// in-memory state and the on-disk units stay in sync (no "resurrected"
// session after the next periodic flush):
//   1. stop a live agent that owns the session (ctx.agents.get(id));
//   2. flush a live session so dispose-time teardown has no pending writes;
//   3. recover the session's attachment references from its log while the log
//      still exists (needed by the targeted attachment GC in step 8);
//   4. remove the persisted log dir  ~/.dsh/sessions/<slug>/<id>/ for both id
//      spellings (bare id and `session-` prefixed), retrying after the dispose
//      path may have re-created it;
//   5. drop the projection-cache row (storageDomain 'session_projcache',
//      table 'sessions');
//   6. only after the log is confirmed gone, remove the workspace accounting.
//      This goes through the `workspaceRegistry` service API (unpin /
//      unarchive / detachSession) whenever it exists: the registry keeps its
//      own in-memory snapshot of the global state and writes that snapshot
//      back on every pin/archive, so a direct domain write could be
//      resurrected.  The raw storageDomain write stays as a fallback for
//      hosts/profiles without the registry service.
//   7. remove this session's local spill files (spillStore root +
//      %TEMP%/dsh-spill-*): tool outputs are persisted there under a
//      `session-<sha256(id)[0..12]>` directory and DSH only reclaims them
//      after `cleanupPeriodDays`;
//   8. targeted attachment GC: content-addressed blobs referenced ONLY by the
//      deleted session are removed (a blob another session still references
//      is kept; a blob modified in the last 30 minutes is kept to avoid
//      racing an in-flight turn);
//   9. drop project directories left empty by the deletion.
//
// Startup / manual residue sweep: sessions can already be half-deleted (ghost
// ids in workspace accounting, orphan projection rows, empty project dirs)
// from older DSH/plugin versions or hand cleanup.  `sweepOrphans()` fixes
// those through the same live service APIs, at startup (best-effort, delayed)
// and on demand through the `workbench_session_gc` tool.
//
// The client reloads after a successful delete, so the fresh session list is
// re-fetched from the host (session-query reads the persisted dirs).
//
// ESM module format (cordis bundle rule): named exports apply/inject/name.
// All registrations belong to the plugin fiber (ctx.effect / disposers).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'

const name = 'chameleon-session-delete'
// Only `tools` is a hard dependency; webServer is optional (see apply).
const inject = ['tools']

// Session ids are opaque here: current DSH mints UUIDs, but counter ids and
// custom ids exist in the wild too, and deleting them must work the same way.
// The id is only ever used as ONE path segment under ~/.dsh/sessions/<slug>/,
// so the rule is path safety, not a UUID shape.  Reject separators, Windows
// reserved characters, control characters, the bare "." / ".." names, and
// trailing dots or spaces (Windows strips those silently, so such an id could
// never name a directory findSessionDirs would match).
const SESSION_ID_PREFIX = 'session-'
const MAX_SESSION_ID_LENGTH = 200
const UNSAFE_SESSION_ID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/

function normalizeSessionId(value) {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (id === '' || id.length > MAX_SESSION_ID_LENGTH) return null
  if (id === '.' || id === '..') return null
  if (UNSAFE_SESSION_ID_CHARS.test(id)) return null
  if (id.endsWith('.') || id.endsWith(' ')) return null
  return id
}

class DeleteError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// --- path helpers ------------------------------------------------------------

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function sessionsRoot() {
  return path.join(dshHome(), 'sessions')
}

// Session ids may appear in two spellings in different stores: the bare id and
// the prefixed form (`session-<id>`).  The on-disk JSONL backend encodes the
// exact session id, while older/workspace/projcache rows can carry either
// spelling.  Return every unique spelling we should clean up, whatever shape
// the bare id has (UUID, counter, custom).
function sessionIdVariants(sessionId) {
  const bare = sessionId.startsWith(SESSION_ID_PREFIX)
    ? sessionId.slice(SESSION_ID_PREFIX.length)
    : sessionId
  return bare ? [bare, `${SESSION_ID_PREFIX}${bare}`] : [sessionId]
}

// --- residue cleanup helpers -------------------------------------------------
// DSH keeps per-session data outside the log directory as well.  Everything
// below is best-effort: a failure is reported in the result object but never
// turns a successful log deletion into an error, and no helper deletes data it
// cannot prove belongs to the deleted session alone.

/** Hex sha256 of a string (the spill backend names session dirs by its prefix). */
function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function attachmentsRoot() {
  return path.join(dshHome(), 'attachments', 'v1')
}

/** Compressed-log ceiling: a huge log skips the scan instead of risking a giant decode. */
const MAX_LOG_BYTES = 64 * 1024 * 1024
/** A blob younger than this may belong to a turn that is still settling (or another live session). */
const ATTACHMENT_MIN_AGE_MS = 30 * 60 * 1000
/** Overall budget for the cross-session reference scan; past it the GC is skipped. */
const REFERENCE_SCAN_BUDGET_MS = 20000

// Storage for one encoded attachment: images live under `objects/`, files keep a
// canonical `file-objects/` object plus `files/<digest>/<name>` aliases.
function attachmentBlobPaths(hash) {
  const root = attachmentsRoot()
  const prefix = hash.slice(0, 2)
  return [
    path.join(root, 'objects', prefix, hash),
    path.join(root, 'file-objects', prefix, hash),
    path.join(root, 'files', prefix, hash),
  ]
}

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function sessionLogDirs() {
  const root = sessionsRoot()
  const dirs = []
  for (const slug of readDirSafe(root)) {
    if (!slug.isDirectory()) continue
    const slugDir = path.join(root, slug.name)
    for (const session of readDirSafe(slugDir)) {
      if (session.isDirectory()) dirs.push({ name: session.name, dir: path.join(slugDir, session.name) })
    }
  }
  return dirs
}

// zstd frame magic: 28 B5 2F FD. The JSONL backend may also write plain JSONL.
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decode one persisted log generation.
 *
 * The JSONL backend appends one zstd frame per write, so the file is a
 * CONCATENATED zstd stream.  Node's `zstdDecompressSync` only decodes the first
 * frame of such a stream (it silently ignores the rest — verified on the Node
 * 24 runtime this plugin runs in), so the frames are walked one by one:
 * every frame starts with the magic bytes, a frame is decoded from its magic to
 * the next one, and a decode failure is retried with the next candidate magic
 * (a compressed payload can contain the magic by accident; the real frame
 * boundary then decodes cleanly).
 *
 * @returns {{ text: string, complete: boolean }} `complete` is false when some
 * frame could not be decoded: callers that need a full reference list must treat
 * that as "unknown" rather than "empty".
 */
function decodeSessionLog(buf) {
  if (buf.length < 4 || !buf.subarray(0, 4).equals(ZSTD_MAGIC)) {
    return { text: buf.toString('utf8'), complete: true }
  }
  const positions = [0]
  for (let at = buf.indexOf(ZSTD_MAGIC, 1); at >= 0; at = buf.indexOf(ZSTD_MAGIC, at + 1)) {
    positions.push(at)
  }
  const parts = []
  let index = 0
  while (index < positions.length) {
    let next = index + 1
    let decoded = null
    while (next <= positions.length) {
      const end = next < positions.length ? positions[next] : buf.length
      try {
        decoded = zlib.zstdDecompressSync(buf.subarray(positions[index], end))
        break
      } catch {
        next += 1
        if (next - index > 64) break
      }
    }
    if (decoded === null) {
      return { text: Buffer.concat(parts).toString('utf8'), complete: false }
    }
    parts.push(decoded)
    index = next
  }
  return { text: Buffer.concat(parts).toString('utf8'), complete: true }
}

/** Read every persisted log generation of one session dir (best-effort). */
function readLogTextFromDir(dir) {
  const chunks = []
  let complete = true
  for (const entry of readDirSafe(dir)) {
    if (!entry.isFile() || !/\.jsonl(\.zstd)?$/.test(entry.name)) continue
    let buf
    try {
      buf = fs.readFileSync(path.join(dir, entry.name))
    } catch {
      continue
    }
    if (buf.length > MAX_LOG_BYTES) return null
    const decoded = decodeSessionLog(buf)
    chunks.push(decoded.text)
    if (!decoded.complete) complete = false
  }
  return chunks.length > 0 ? { text: chunks.join('\n'), complete } : null
}

/** The attachment references (`sha256:<64 hex>`) carried by a session's own log. */
function sessionAttachmentHashes(sessionId) {
  const hashes = new Set()
  for (const dir of findSessionDirs(sessionId)) {
    const log = readLogTextFromDir(dir)
    if (!log) continue
    for (const match of log.text.matchAll(/sha256:([0-9a-f]{64})/g)) hashes.add(match[1])
  }
  return hashes
}

/**
 * Hashes still referenced by any OTHER persisted session log.  Only content the
 * deleted session used is looked up, so the scan cost scales with that set.
 * Returns null when the scan could not complete (timeout / undecodable log):
 * the caller must not delete anything then, because "absent from a partial
 * scan" does not prove "unreferenced".
 */
function referencedAttachmentHashes(excludeNames) {
  const referenced = new Set()
  const deadline = Date.now() + REFERENCE_SCAN_BUDGET_MS
  const exclude = new Set(excludeNames)
  for (const entry of sessionLogDirs()) {
    if (Date.now() > deadline) return null
    if (exclude.has(entry.name)) continue
    const log = readLogTextFromDir(entry.dir)
    if (!log) continue
    if (!log.complete) return null
    for (const match of log.text.matchAll(/sha256:([0-9a-f]{64})/g)) referenced.add(match[1])
  }
  return referenced
}

/** Whether every existing blob path for one hash is old enough to delete. */
function attachmentBlobAgeMs(hash) {
  let youngest = null
  for (const target of attachmentBlobPaths(hash)) {
    try {
      const stat = fs.lstatSync(target)
      const age = Date.now() - stat.mtimeMs
      if (youngest === null || age < youngest) youngest = age
    } catch {
      /* absent path */
    }
  }
  return youngest
}

/**
 * Clear the read-only attribute before deleting.  dsh-attachment-local publishes
 * immutable objects with `chmod 0o444`, which is the Windows read-only attribute;
 * Node 24's `fs.rmSync` reports EPERM for such files (Node 26 clears it itself),
 * so make the path writable first.  Best-effort: the following rm reports the
 * real outcome.
 */
function makeDeletable(target) {
  try {
    fs.chmodSync(target, 0o777)
  } catch {
    /* absent or already writable */
  }
}

function removeAttachmentBlob(hash) {
  let removed = false
  for (const target of attachmentBlobPaths(hash)) {
    try {
      const stat = fs.lstatSync(target)
      makeDeletable(target)
      if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true })
      else fs.rmSync(target, { force: true })
      removed = true
    } catch {
      /* absent */
    }
  }
  return removed
}

/**
 * Targeted attachment GC: delete blobs used by the deleted session only.
 * Returns { candidates, removed, keptReferenced, keptFresh, skipped }.
 */
function gcSessionAttachments(sessionId, hashes) {
  const result = { candidates: hashes ? hashes.size : 0, removed: 0, keptReferenced: 0, keptFresh: 0, skipped: false }
  if (!hashes || hashes.size === 0) return result
  let referenced
  try {
    referenced = referencedAttachmentHashes(sessionIdVariants(sessionId))
  } catch {
    result.skipped = true
    return result
  }
  if (referenced === null) {
    result.skipped = true
    return result
  }
  for (const hash of hashes) {
    if (referenced.has(hash)) {
      result.keptReferenced += 1
      continue
    }
    const age = attachmentBlobAgeMs(hash)
    if (age === null) continue
    if (age < ATTACHMENT_MIN_AGE_MS) {
      result.keptFresh += 1
      continue
    }
    try {
      if (removeAttachmentBlob(hash)) result.removed += 1
    } catch {
      /* permission or race: leave it for the maintenance sweep */
    }
  }
  return result
}

// The spill backend writes `<root>/session-<sha256(sessionId)[0..12]>/<name>`
// and only reclaims files after `cleanupPeriodDays` (default 30) at startup.
const SPILL_ROOT_RE = /^dsh-spill-[A-Za-z0-9]{6}$/

function spillRoots(ctx) {
  const roots = new Set()
  try {
    const store = ctx && typeof ctx.get === 'function' ? ctx.get('spillStore') : undefined
    if (store && typeof store.root === 'string' && store.root) roots.add(store.root)
  } catch {
    /* optional service */
  }
  const tmp = os.tmpdir()
  for (const entry of readDirSafe(tmp)) {
    if (entry.isDirectory() && SPILL_ROOT_RE.test(entry.name)) roots.add(path.join(tmp, entry.name))
  }
  return [...roots]
}

function removeSpillDirs(ctx, sessionId) {
  const hashes = [...new Set(sessionIdVariants(sessionId).map((variant) => sha256Hex(variant).slice(0, 12)))]
  let removed = 0
  for (const root of spillRoots(ctx)) {
    for (const hash of hashes) {
      try {
        const dir = path.join(root, `session-${hash}`)
        if (fs.statSync(dir).isDirectory()) {
          fs.rmSync(dir, { recursive: true, force: true })
          removed += 1
        }
      } catch {
        /* absent */
      }
    }
  }
  return removed
}

/** Remove project directories left empty by the deletion. */
function removeEmptyProjectDirs() {
  const root = sessionsRoot()
  let removed = 0
  for (const entry of readDirSafe(root)) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    try {
      if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir)
        removed += 1
      }
    } catch {
      /* keep scanning */
    }
  }
  return removed
}

// Locate ~/.dsh/sessions/<slug>/<sessionId>/ by scanning every slug dir, so
// the workspace-path encoding never has to be re-derived here.  Returns every
// matching directory (both id spellings, if both exist).
function findSessionDirs(sessionId) {
  const root = sessionsRoot()
  const variants = sessionIdVariants(sessionId)
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const found = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    for (const variant of variants) {
      const candidate = path.join(root, e.name, variant)
      try {
        if (fs.statSync(candidate).isDirectory() && !found.includes(candidate)) found.push(candidate)
      } catch { /* keep scanning */ }
    }
  }
  return found
}

// Remove every on-disk session directory for both id spellings.
function removeSessionDirs(sessionId) {
  const dirs = findSessionDirs(sessionId)
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return dirs.length > 0
}

// --- live storage mutation (memory + disk stay consistent) -------------------

// Remove the session from the projection-cache domain and (optionally) the
// workspace accounting domain. Uses the opened domain facilities (the
// authoritative in-memory state) so the periodic flush can never re-publish a
// stale row.  All id spellings are cleaned because projcache/workspace rows
// may use either the bare id or the `session-` prefixed form.
// Domain API: storageDomain.get(name) -> domain with .table(name) (KvTable:
// get/put/delete/entries) and .global (handle with get/set).
async function stripStorageDomains(ctx, sessionId, { workspace = true, projcache = true } = {}) {
  const sd = ctx.get('storageDomain')
  if (!sd) return { projRemoved: false, workspaceRemoved: false }
  const variants = sessionIdVariants(sessionId)
  let projRemoved = false
  let workspaceRemoved = false

  const proj = projcache ? sd.get('session_projcache') : undefined
  if (proj && typeof proj.table === 'function') {
    try {
      const sessions = proj.table('sessions')
      for (const variant of variants) {
        if (sessions.get(variant) !== undefined) {
          await sessions.delete(variant)
          projRemoved = true
        }
      }
    } catch { /* unit closed or table absent: nothing to clean */ }
  }

  if (workspace) {
    const ws = sd.get('workspace')
    if (ws && typeof ws.table === 'function') {
      try {
        const workspaces = ws.table('workspaces')
        for (const [wid, rec] of workspaces.entries()) {
          if (rec && Array.isArray(rec.sessionIds) && variants.some((v) => rec.sessionIds.includes(v))) {
            await workspaces.put(wid, {
              ...rec,
              sessionIds: rec.sessionIds.filter((x) => !variants.includes(x)),
            })
            workspaceRemoved = true
          }
        }
      } catch { /* unit closed or table absent */ }
      try {
        const g = ws.global
        if (g && typeof g.get === 'function' && typeof g.set === 'function') {
          const state = g.get()
          if (state) {
            // Both registry-global sets name sessions by id: the archive set and
            // the pin set.  Historical DSH versions only had the archive set, so
            // the pin filter is conditional.
            const next = { ...state }
            let changed = false
            if (Array.isArray(state.archivedSessionIds) && variants.some((v) => state.archivedSessionIds.includes(v))) {
              next.archivedSessionIds = state.archivedSessionIds.filter((x) => !variants.includes(x))
              changed = true
            }
            if (Array.isArray(state.pinnedSessionIds) && variants.some((v) => state.pinnedSessionIds.includes(v))) {
              next.pinnedSessionIds = state.pinnedSessionIds.filter((x) => !variants.includes(x))
              changed = true
            }
            if (changed) {
              await g.set(next)
              workspaceRemoved = true
            }
          }
        }
      } catch { /* no global slot or unit closed */ }
    }
  }

  return { projRemoved, workspaceRemoved }
}

/**
 * Remove a deleted session from the workspace accounting.
 *
 * Prefers the `workspaceRegistry` service API: the registry caches the global
 * state (`this.state`) and every pin/archive/order operation writes that whole
 * snapshot back, so a direct storageDomain write (the fallback below) can be
 * overwritten by the next registry mutation.  `unpinSession`, `unarchiveSession`
 * and `Workspace#detachSession` go through the registry's own write chain and
 * keep that snapshot coherent.
 *
 * Both paths are attempted: the registry first, then the raw domain write as a
 * belt-and-braces cleanup for anything the registry API did not report (older
 * hosts, a registry that is still initializing, a record the API left behind).
 * The domain write reads the CURRENT domain value, which the registry has just
 * updated, so it cannot resurrect a removed id here.
 */
async function cleanupWorkspaceAccounting(ctx, sessionId) {
  const variants = sessionIdVariants(sessionId)
  let removed = false
  const registry = ctx.get('workspaceRegistry')
  if (registry && typeof registry.list === 'function') {
    const pinned = () => {
      try { return registry.pinnedSessionIds || [] } catch { return [] }
    }
    const archived = () => {
      try { return registry.archivedSessionIds || [] } catch { return [] }
    }
    for (const variant of variants) {
      try {
        if (pinned().includes(variant) && typeof registry.unpinSession === 'function') {
          await registry.unpinSession(variant)
          if (!pinned().includes(variant)) removed = true
        }
      } catch { /* registry unavailable or rejected: fallback cleans it */ }
      try {
        if (archived().includes(variant) && typeof registry.unarchiveSession === 'function') {
          await registry.unarchiveSession(variant)
          if (!archived().includes(variant)) removed = true
        }
      } catch { /* fallback cleans it */ }
      try {
        for (const workspace of registry.list() || []) {
          let ids = []
          try { ids = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : [] } catch { ids = [] }
          if (!ids.includes(variant)) continue
          if (typeof workspace.detachSession === 'function') {
            await workspace.detachSession(variant)
            removed = true
          }
        }
      } catch { /* fallback cleans it */ }
    }
  }
  // Raw domain write: fallback for hosts without the registry service and a
  // final sweep for records the registry API does not expose.
  const domain = await stripStorageDomains(ctx, sessionId, { workspace: true, projcache: false })
  return removed || domain.workspaceRemoved
}

// --- core delete --------------------------------------------------------------

// Stop a live agent (cancel the active turn, wait for quiescence) before its
// session is deleted. Cancel causes surface in the log as a user-cancel; the
// wait is time-boxed so a stuck driver never blocks the deletion.
async function stopAgentIfRunning(ctx, sessionId) {
  const agents = ctx.get('agents')
  if (!agents || typeof agents.get !== 'function') return false
  const agent = agents.get(sessionId)
  if (!agent) return false
  if (typeof agent.cancel === 'function') {
    try { agent.cancel({ kind: 'user' }) } catch { /* agent may already be settling */ }
  }
  if (typeof agent.whenIdle === 'function') {
    try {
      await Promise.race([
        agent.whenIdle(),
        new Promise((resolve) => setTimeout(resolve, 15000)),
      ])
    } catch { /* ignore: proceed with deletion anyway */ }
  }
  return true
}

// Flush a live session before detaching it.  The persistence layer flushes on
// session/disposed; flushing here first drains any pending writes while the
// session is still alive, so the later dispose has nothing to re-create after
// we delete the on-disk log.
async function flushSessionIfLive(ctx, sessionId) {
  const sessions = ctx.get('sessions')
  if (!sessions || typeof sessions.get !== 'function') return false
  let flushed = false
  for (const variant of sessionIdVariants(sessionId)) {
    const session = sessions.get(variant)
    if (!session) continue
    if (typeof sessions.flush === 'function') {
      try {
        await sessions.flush(session)
        flushed = true
      } catch { /* ignore: deletion proceeds and removes the log anyway */ }
    }
  }
  return flushed
}

// Remove the session from the in-memory store so host session lists stop
// returning it and no flush can re-materialize its files. The store has no
// public remove API; detachEntered is the store's own teardown path (deletes
// the entry and emits session/disposed). Try every id spelling defensively.
function detachLiveSession(ctx, sessionId) {
  const sessions = ctx.get('sessions')
  if (!sessions) return false
  let detached = false
  try {
    const store = sessions.store
    for (const variant of sessionIdVariants(sessionId)) {
      const entry = store && typeof store.get === 'function' ? store.get(variant) : undefined
      if (entry === undefined) continue
      if (typeof sessions.detachEntered === 'function') {
        sessions.detachEntered(entry)
        detached = true
      } else if (store && typeof store.delete === 'function') {
        store.delete(variant)
        if (sessions.attachments && entry.session && typeof sessions.attachments.delete === 'function') {
          sessions.attachments.delete(entry.session)
        }
        detached = true
      }
    }
  } catch { /* ignore */ }
  return detached
}

async function deleteSessionCore(ctx, rawSessionId) {
  const sessionId = normalizeSessionId(rawSessionId)
  if (sessionId === null) {
    throw new DeleteError(`invalid session id: ${String(rawSessionId).slice(0, 80)}`, 400)
  }
  const stopped = await stopAgentIfRunning(ctx, sessionId)
  await flushSessionIfLive(ctx, sessionId)
  const detached = detachLiveSession(ctx, sessionId)

  // Recover the attachment references while the log still exists: the targeted
  // GC below can only prove "unreferenced by another session" for content the
  // deleted session actually used.
  let attachmentHashes = null
  try {
    attachmentHashes = sessionAttachmentHashes(sessionId)
  } catch { /* GC skipped; the log deletion itself must not depend on it */ }

  // Remove every on-disk log directory first.  If the filesystem refuses, fail
  // before touching workspace accounting so a half-deleted session cannot fall
  // out of its group into "Ungrouped".
  const firstDirRemoved = removeSessionDirs(sessionId)

  // Remove projection rows now (they are not the grouping authority), then
  // sweep again: the dispose path may have been mid-flight and could have
  // re-created a directory after the first removal.
  const projStorage = await stripStorageDomains(ctx, sessionId, { workspace: false })
  const secondDirRemoved = removeSessionDirs(sessionId)
  await new Promise((resolve) => setImmediate(resolve))
  const thirdDirRemoved = removeSessionDirs(sessionId)

  const remainingDirs = findSessionDirs(sessionId)
  if (remainingDirs.length > 0) {
    throw new DeleteError(`session files could not be fully removed: ${remainingDirs.join(', ')}`, 500)
  }

  // Only after the log is confirmed gone do we detach the session from its
  // workspace accounting (ownership, pin and archive sets).
  const workspaceRemoved = await cleanupWorkspaceAccounting(ctx, sessionId)
  const dirRemoved = firstDirRemoved || secondDirRemoved || thirdDirRemoved
  const projRemoved = projStorage.projRemoved
  if (!dirRemoved && !projRemoved && !workspaceRemoved) {
    throw new DeleteError(`session not found: ${sessionId}`, 404)
  }

  // Secondary copies.  Every one is best-effort: the session is already gone
  // from the authoritative store, and a failure here must not report failure.
  const residue = { spillRemoved: 0, attachments: null, emptyDirsRemoved: 0 }
  try {
    residue.spillRemoved = removeSpillDirs(ctx, sessionId)
  } catch { /* no temp access */ }
  try {
    residue.attachments = gcSessionAttachments(sessionId, attachmentHashes)
  } catch { /* leave blobs to the maintenance sweep */ }
  try {
    residue.emptyDirsRemoved = removeEmptyProjectDirs()
  } catch { /* keep the directory */ }

  return { stopped, detached, dirRemoved, projRemoved, workspaceRemoved, ...residue }
}

// --- residue sweep (pre-existing / half-deleted sessions) ---------------------

/**
 * Find sessions that are still referenced by DSH's stores although their log
 * directory is gone.  These are the leftovers of older DSH/plugin versions or
 * of manual folder deletion; the sweep removes the references through the live
 * APIs so the stores' in-memory snapshots stay coherent.
 *
 * @param ctx - plugin context.
 * @param options.dryRun - only report, change nothing.
 * @returns counts per bucket.
 */
async function sweepOrphans(ctx, options = {}) {
  const dryRun = options.dryRun === true
  const report = { checked: 0, accountingRemoved: 0, projRowsRemoved: 0, emptyDirsRemoved: 0, skipped: false }
  const logDirs = sessionLogDirs()
  const storedNames = new Set(logDirs.map((entry) => entry.name))
  if (storedNames.size === 0) {
    // No session log at all: this looks like a fresh/empty home or a moved
    // sessions root.  Removing every accounting reference would be destructive,
    // so the sweep refuses instead of guessing.
    report.skipped = true
    return report
  }
  const exists = (sessionId) => sessionIdVariants(sessionId).some((variant) => storedNames.has(variant))
  const variantsOf = (sessionId) => new Set(sessionIdVariants(sessionId))

  const registry = ctx.get('workspaceRegistry')
  if (registry && typeof registry.list === 'function') {
    const archived = () => {
      try { return registry.archivedSessionIds || [] } catch { return [] }
    }
    const pinned = () => {
      try { return registry.pinnedSessionIds || [] } catch { return [] }
    }
    try {
      for (const id of [...pinned()]) {
        report.checked += 1
        if (exists(id)) continue
        if (dryRun) { report.accountingRemoved += 1; continue }
        try {
          await registry.unpinSession(id)
          if (!pinned().includes(id)) report.accountingRemoved += 1
        } catch { /* report only */ }
      }
      for (const id of [...archived()]) {
        report.checked += 1
        if (exists(id)) continue
        if (dryRun) { report.accountingRemoved += 1; continue }
        try {
          await registry.unarchiveSession(id)
          if (!archived().includes(id)) report.accountingRemoved += 1
        } catch { /* report only */ }
      }
    } catch { /* registry unavailable */ }
    try {
      // NOTE: `workspace.sessionIds` is a filtered view (it hides ids whose
      // header the startup index dropped), so ghost detection must use the
      // raw records.  The detach itself goes through the entity's write chain
      // when the registry knows the workspace.
      const sd = ctx.get('storageDomain')
      const ws = sd && typeof sd.get === 'function' ? sd.get('workspace') : undefined
      const table = ws && typeof ws.table === 'function' ? ws.table('workspaces') : undefined
      if (table && typeof table.entries === 'function') {
        for (const [wid, record] of table.entries()) {
          if (!record || !Array.isArray(record.sessionIds)) continue
          const ghosts = record.sessionIds.filter((id) => !exists(id))
          for (const id of ghosts) {
            report.checked += 1
            if (dryRun) { report.accountingRemoved += 1; continue }
            try {
              const entity = typeof registry.get === 'function' ? registry.get(wid) : undefined
              if (entity && typeof entity.detachSession === 'function') await entity.detachSession(id)
              else await table.put(wid, { ...record, sessionIds: record.sessionIds.filter((x) => x !== id) })
              report.accountingRemoved += 1
            } catch { /* report only */ }
          }
        }
      }
    } catch { /* registry/storage unavailable */ }
  }

  // Projection-cache rows are derived data: a row whose log no longer exists
  // can never be read again, so remove it (both id spellings).
  const sd = ctx.get('storageDomain')
  if (sd) {
    try {
      const proj = sd.get('session_projcache')
      const sessions = proj && typeof proj.table === 'function' ? proj.table('sessions') : undefined
      if (sessions && typeof sessions.entries === 'function') {
        for (const [id] of sessions.entries()) {
          report.checked += 1
          if (exists(id)) continue
          if (dryRun) { report.projRowsRemoved += 1; continue }
          try {
            await sessions.delete(id)
            report.projRowsRemoved += 1
          } catch { /* report only */ }
        }
      }
    } catch { /* no projection cache in this profile */ }
  }

  if (!dryRun) {
    try {
      report.emptyDirsRemoved = removeEmptyProjectDirs()
    } catch { /* keep */ }
  }
  return report
}

/**
 * Remove the hash-prefix directories left empty after blob removal.  The store
 * keeps `objects/<hash[0..2]>/<hash>` (same for file-objects/files); clearing
 * every blob of a prefix leaves a 0-byte directory shell behind, which looks
 * like residue on disk even though no data is there.  Only directories that are
 * really empty are removed — a prefix that still holds a blob is untouched.
 */
function removeEmptyAttachmentDirs() {
  let removed = 0
  for (const sub of ['objects', 'file-objects', 'files']) {
    const base = path.join(attachmentsRoot(), sub)
    for (const entry of readDirSafe(base)) {
      if (!entry.isDirectory()) continue
      const prefixPath = path.join(base, entry.name)
      try {
        if (fs.readdirSync(prefixPath).length === 0) {
          fs.rmdirSync(prefixPath)
          removed += 1
        }
      } catch {
        /* keep scanning */
      }
    }
  }
  return removed
}

/**
 * Global attachment GC for the maintenance tool: delete content-addressed blobs
 * that no persisted session log references any more.  Blobs younger than
 * ATTACHMENT_MIN_AGE_MS are kept (a live turn may still be settling).
 */
function gcOrphanAttachments() {
  const report = { scannedLogs: 0, referenced: 0, blobs: 0, removed: 0, keptFresh: 0, emptyDirs: 0, skipped: false }
  const referenced = new Set()
  const deadline = Date.now() + REFERENCE_SCAN_BUDGET_MS
  for (const entry of sessionLogDirs()) {
    if (Date.now() > deadline) { report.skipped = true; return report }
    const log = readLogTextFromDir(entry.dir)
    if (!log) continue
    if (!log.complete) { report.skipped = true; return report }
    report.scannedLogs += 1
    for (const match of log.text.matchAll(/sha256:([0-9a-f]{64})/g)) referenced.add(match[1])
  }
  report.referenced = referenced.size
  for (const sub of ['objects', 'file-objects', 'files']) {
    const base = path.join(attachmentsRoot(), sub)
    for (const prefixDir of readDirSafe(base)) {
      if (!prefixDir.isDirectory()) continue
      const prefixPath = path.join(base, prefixDir.name)
      for (const blob of readDirSafe(prefixPath)) {
        report.blobs += 1
        if (!/^[0-9a-f]{64}$/.test(blob.name)) continue
        if (referenced.has(blob.name)) continue
        const target = path.join(prefixPath, blob.name)
        let age = null
        try { age = Date.now() - fs.lstatSync(target).mtimeMs } catch { continue }
        if (age < ATTACHMENT_MIN_AGE_MS) { report.keptFresh += 1; continue }
        try {
          const stat = fs.lstatSync(target)
          makeDeletable(target)
          if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true })
          else fs.rmSync(target, { force: true })
          report.removed += 1
        } catch { /* report only */ }
      }
    }
  }
  report.emptyDirs = removeEmptyAttachmentDirs()
  return report
}

// --- session list (for sidebar menu title -> id matching) ----------------------

// Lightweight {sessionId, title, running} list from the projection cache
// (authoritative titles) plus the live agent registry. The client sidebar
// menu item matches the row title against this list so it can open the
// delete dialog for the right session WITHOUT switching to it.
async function listSessions(ctx) {
  const agents = ctx.get('agents')
  const sd = ctx.get('storageDomain')
  const out = []
  if (!sd) return out
  const proj = sd.get('session_projcache')
  if (!proj || typeof proj.table !== 'function') return out
  try {
    const sessions = proj.table('sessions')
    for (const [id, rec] of sessions.entries()) {
      if (!rec || typeof rec !== 'object') continue
      const rows = rec.rows && typeof rec.rows === 'object' ? rec.rows : {}
      const titleRow = rows.title && rows.title.val
      const identity = rec.identity && typeof rec.identity === 'object' ? rec.identity : {}
      out.push({
        sessionId: id,
        title: typeof titleRow === 'string' ? titleRow : null,
        createdAt: typeof identity.createdAt === 'number' ? identity.createdAt : null,
        running: !!(agents && typeof agents.get === 'function' && agents.get(id)),
      })
    }
  } catch { /* unit closed or table absent */ }
  return out
}

// --- http helpers -------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (d) => {
      data += d
      if (data.length > 1e6) req.destroy()
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('aborted')))
  })
}

// --- request fence ------------------------------------------------------------
// These routes are registered on the webServer carrier, which — unlike the Host
// Connection carrier that serves /api — applies no browser fence and no session
// cookie check: whatever can reach the port can call them.  The app's own page
// is same-origin, so refuse exactly the markers a foreign page cannot forge,
// using the same rules the Connection fence applies to /api:
//   * `Sec-Fetch-Site: cross-site`, which browsers attach to cross-site calls;
//   * an `Origin` whose authority is not this request's own `Host`.
// Non-browser callers (the CLI, curl, in-process tools) send neither header and
// stay allowed, so nothing inside the app is affected.  A page on another site
// can no longer delete sessions; a local process still can (see README caveats).
function isForeignBrowserRequest(req) {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site.toLowerCase() === 'cross-site') return true
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return false
  try {
    return new URL(origin).host !== String(req.headers.host || '')
  } catch {
    // `Origin: null` (opaque origin) is never this app's own page.
    return true
  }
}

// --- plugin -------------------------------------------------------------------
// webServer is OPTIONAL (a terminal-only profile has no web surface): the
// HTTP endpoint registers when the service exists or appears later
// (ctx.inject child), while the tool registers unconditionally — so the
// plugin never hangs waiting on a service a profile will never provide.

function apply(ctx) {
  function registerHttp(host, targetCtx) {
    targetCtx.effect(() => host.register({
      kind: 'exact',
      path: '/__chameleon/session/list',
      handler: async (req, res) => {
        if (isForeignBrowserRequest(req)) {
          sendJson(res, 403, { error: 'cross-origin request refused' })
          return
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          sendJson(res, 200, { ok: true, sessions: await listSessions(ctx) })
        } catch (e) {
          sendJson(res, 500, { error: e.message })
        }
      },
    }))

    targetCtx.effect(() => host.register({
      kind: 'exact',
      path: '/__chameleon/session/delete',
      handler: async (req, res) => {
        if (isForeignBrowserRequest(req)) {
          sendJson(res, 403, { error: 'cross-origin request refused' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        let args = {}
        try {
          const body = await readBody(req)
          if (body) args = JSON.parse(body)
        } catch {
          sendJson(res, 400, { error: 'bad json body' })
          return
        }
        const sessionId = String(args.sessionId || '').trim()
        if (!sessionId) {
          sendJson(res, 400, { error: 'sessionId required' })
          return
        }
        try {
          const result = await deleteSessionCore(ctx, sessionId)
          sendJson(res, 200, { ok: true, removed: [sessionId], ...result })
        } catch (e) {
          const status = e instanceof DeleteError && e.status ? e.status : 500
          sendJson(res, status, { error: e.message })
        }
      },
    }))
  }

  const ws = ctx.get('webServer')
  if (ws !== undefined) {
    registerHttp(ws, ctx)
  } else {
    // Register the route once a web surface appears (never in terminal-only
    // profiles); the child fiber is torn down with this plugin's context.
    ctx.inject(['webServer'], (sub) => {
      registerHttp(sub.webServer, sub)
    })
  }

  ctx.tools.register(defineTool({
    name: 'workbench_session_delete',
    description: 'Permanently delete one session of this workbench: stops the agent if it is running (cancel + quiescence), then removes its persisted log, projection-cache row and workspace accounting (ownership, pin and archive sets). It also removes that session\'s local spill files, content-addressed attachments no other session still references, and empty project directories. After deletion the client reloads; the edit-mode caller should verify with workbench_status or the session list.',
    parameters: {
      sessionId: {
        type: 'string',
        required: true,
        description: 'The session id to delete: the bare id or its session-<id> spelling (UUIDs, counter ids and custom ids all work).',
      },
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) { return [{ type: 'text', text: value }] },
    },
    async execute(args) {
      const sessionId = String(args.sessionId || '').trim()
      try {
        const result = await deleteSessionCore(ctx, sessionId)
        const attachments = result.attachments
        return [
          `deleted: ${sessionId}`,
          `log dir removed: ${result.dirRemoved}`,
          `projection row removed: ${result.projRemoved}`,
          `workspace accounting removed: ${result.workspaceRemoved}`,
          `spill dirs removed: ${result.spillRemoved}`,
          `attachments removed: ${attachments ? attachments.removed : 0}` +
            (attachments
              ? ` (kept: ${attachments.keptReferenced} shared, ${attachments.keptFresh} recent` +
                (attachments.skipped ? ', scan skipped' : '') + ')'
              : ' (no attachment references)'),
          `empty project dirs removed: ${result.emptyDirsRemoved}`,
        ].join('\n')
      } catch (e) {
        return `delete failed: ${e.message}`
      }
    },
  }))

  // Maintenance sweep for residue that predates this version (ghost accounting
  // ids, orphan projection rows, empty project dirs) — the same sweep also runs
  // automatically, delayed, at startup.
  ctx.tools.register(defineTool({
    name: 'workbench_session_gc',
    description: 'Clean residue of sessions that no longer exist: ghost ids in workspace accounting (ownership, pin, archive sets), projection-cache rows without a log, and empty project directories. With attachments=true it also deletes content-addressed attachment blobs that no persisted session references. Defaults to a dry run; set dryRun=false to apply.',
    parameters: {
      dryRun: {
        type: 'boolean',
        description: 'Report only (true, default) or apply the cleanup (false).',
      },
      attachments: {
        type: 'boolean',
        description: 'Also sweep orphaned attachment blobs (scans every session log; slower).',
      },
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) { return [{ type: 'text', text: value }] },
    },
    async execute(args) {
      const dryRun = args.dryRun !== false && args.dryRun !== 'false'
      try {
        const sweep = await sweepOrphans(ctx, { dryRun })
        const lines = [
          `${dryRun ? 'dry run' : 'applied'}: session residue sweep`,
          `references checked: ${sweep.checked}`,
          `workspace accounting ids removed: ${sweep.accountingRemoved}`,
          `projection rows removed: ${sweep.projRowsRemoved}`,
          `empty project dirs removed: ${sweep.emptyDirsRemoved}`,
        ]
        if (sweep.skipped) lines.push('note: no session log directory found, sweep skipped')
        if (args.attachments === true || args.attachments === 'true') {
          if (dryRun) {
            lines.push('attachments: dry run does not scan blobs; set dryRun=false to sweep them')
          } else {
            const gc = gcOrphanAttachments()
            lines.push(
              `attachments: logs scanned ${gc.scannedLogs}, blobs ${gc.blobs}, removed ${gc.removed}` +
                ` (kept ${gc.keptFresh} recent${gc.skipped ? ', scan incomplete' : ''}),` +
                ` empty prefix dirs removed ${gc.emptyDirs}`,
            )
          }
        }
        return lines.join('\n')
      } catch (e) {
        return `gc failed: ${e.message}`
      }
    },
  }))

  // Delayed, best-effort startup sweep: the stores and the workspace registry
  // finish initializing asynchronously, so let boot settle before touching them.
  try {
    ctx.inject(['storageDomain', 'workspaceRegistry'], (sub) => {
      sub.effect(() => {
        const timer = setTimeout(() => {
          sweepOrphans(sub, { dryRun: false }).catch(() => { /* best-effort */ })
        }, 8000)
        return () => clearTimeout(timer)
      })
    })
  } catch { /* no storage services in this composition */ }
}

export { apply, inject, name }
