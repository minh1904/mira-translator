import { randomUUID } from 'node:crypto'
import type { SchemaSpec } from './migrate'
import { segment } from '../../../shared/segmentation/segmenter'
import type { Db } from './sqlite'

/** "MIRA" in ASCII. A constant of the file format: never change it once users have data. */
export const WORK_APPLICATION_ID = 0x4d495241

/**
 * Schema of one work file (`works/<id>.mira`). Column and table names avoid SQL keywords
 * (`end`, `text`) so no query needs quoting.
 */
const version1 = `
CREATE TABLE work (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  original_title TEXT,
  description TEXT,
  cover_path TEXT,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('en', 'zh-Hans', 'zh-Hant', 'ja')),
  target_lang TEXT NOT NULL DEFAULT 'vi' CHECK (target_lang = 'vi'),
  status TEXT NOT NULL DEFAULT 'not-started'
    CHECK (status IN ('not-started', 'in-progress', 'paused')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  last_chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- A work file describes exactly one work.
CREATE UNIQUE INDEX work_singleton ON work ((1));

CREATE TABLE chapter (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX chapter_position ON chapter (position);

CREATE TABLE chapter_text (
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('source', 'target')),
  content TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chapter_id, side)
);

CREATE TABLE segment (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('source', 'target')),
  position INTEGER NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset >= start_offset),
  text_rev INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'dirty', 'orphaned')),
  anchor_text TEXT
);
CREATE INDEX segment_order ON segment (chapter_id, side, position);

CREATE TABLE link (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ai', 'user')),
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'needs_review', 'broken')),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX link_chapter ON link (chapter_id);

CREATE TABLE link_member (
  link_id TEXT NOT NULL REFERENCES link (id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL REFERENCES segment (id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id, segment_id)
);
CREATE INDEX link_member_segment ON link_member (segment_id);

CREATE TABLE provenance (
  segment_id TEXT PRIMARY KEY REFERENCES segment (id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('human', 'ai', 'mock', 'import')),
  provider TEXT,
  model TEXT,
  at INTEGER NOT NULL
);

-- Deleting a segment must not silently drop the alignment it took part in.
CREATE TRIGGER segment_delete_flags_links BEFORE DELETE ON segment
BEGIN
  UPDATE link SET status = 'needs_review'
  WHERE status = 'ok'
    AND id IN (SELECT link_id FROM link_member WHERE segment_id = OLD.id);
END;
`

/** Author and genre give the translator model context about the work. Both are optional. */
const version2 = `
ALTER TABLE work ADD COLUMN author TEXT;
ALTER TABLE work ADD COLUMN genre TEXT;
`

/**
 * The cover lives inside the work file so backing up one file backs up everything. The older
 * `work.cover_path` column from version 1 is unused and kept only because SQLite cannot drop it
 * without rebuilding the table.
 */
const version3 = `
CREATE TABLE cover (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mime TEXT NOT NULL CHECK (mime = 'image/jpeg'),
  data BLOB NOT NULL CHECK (length(data) > 0),
  updated_at INTEGER NOT NULL
);
`

/**
 * Whether a side of a chapter has text is needed for every row of the chapter list. In a row the
 * text comes before any later column, so reading even `rev` means walking the overflow pages of a
 * long chapter (measured: about 400 ms for 5,000 chapters). `size` is a small copy of the text
 * length, and the index below holds it next to the key, so the list is answered from the index
 * alone. The application keeps `size` equal to the text length in the same transaction.
 */
const version4 = `
ALTER TABLE chapter_text ADD COLUMN size INTEGER NOT NULL DEFAULT 0 CHECK (size >= 0);
UPDATE chapter_text SET size = length(content);
CREATE INDEX chapter_text_presence ON chapter_text (chapter_id, side, size);
`

/**
 * Images pasted or dropped into a chapter's translation. There is no attachments folder like
 * Obsidian's vault: each image is a blob in this same file, named by a generated ID that the
 * Markdown embed syntax (`![[id]]`) refers to.
 */
const version5 = `
CREATE TABLE image (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  data BLOB NOT NULL CHECK (length(data) > 0),
  created_at INTEGER NOT NULL
);
`

/**
 * Story context entries (glossary terms, characters, dyads, world-building, styles, summaries)
 * and their aliases. For Module 3 (glossary), `kind = 'term'` is utilized.
 */
const version6 = `
CREATE TABLE context_entry (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('term', 'character', 'dyad', 'world', 'style', 'summary')),
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user', 'ai', 'import')),
  forbidden INTEGER NOT NULL DEFAULT 0 CHECK (forbidden IN (0, 1)),
  from_chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  to_chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX context_entry_kind ON context_entry (kind);
CREATE INDEX context_entry_source ON context_entry (source);

CREATE TABLE context_alias (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES context_entry (id) ON DELETE CASCADE,
  form TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (form)
);
CREATE INDEX context_alias_entry ON context_alias (entry_id);
`

/** Persistent AI sessions, proposals and pre-accept checkpoints. Existing text tables are untouched. */
const version7 = `
CREATE TABLE ai_session (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  last_chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ai_session_updated ON ai_session (updated_at DESC, id);

CREATE TABLE ai_turn (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_session (id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('hoi', 'sua', 'ap_dung')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('sending', 'running', 'done', 'cancelled', 'error', 'interrupted')),
  context_json TEXT NOT NULL DEFAULT '[]',
  target_range_json TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  dropped_turns INTEGER NOT NULL DEFAULT 0 CHECK (dropped_turns >= 0),
  provider TEXT,
  model TEXT,
  usage_json TEXT,
  cost_usd REAL,
  finish_reason TEXT CHECK (finish_reason IN ('stop', 'length', 'tool_calls', 'filter')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ai_turn_session_order ON ai_turn (session_id, created_at, id);
CREATE INDEX ai_turn_chapter ON ai_turn (chapter_id, created_at);

CREATE TABLE proposal (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  session_id TEXT REFERENCES ai_session (id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES ai_turn (id) ON DELETE SET NULL,
  origin TEXT NOT NULL CHECK (origin IN ('chat', 'translate')),
  policy TEXT NOT NULL CHECK (policy IN ('review', 'auto')),
  source_rev INTEGER NOT NULL CHECK (source_rev >= 0),
  source_hash TEXT NOT NULL,
  target_base_rev INTEGER NOT NULL CHECK (target_base_rev >= 0),
  target_base_content TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '[]',
  context_hash TEXT,
  provider TEXT,
  model TEXT,
  usage_json TEXT,
  run_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (run_key)
);
CREATE INDEX proposal_chapter_order ON proposal (chapter_id, created_at, id);
CREATE INDEX proposal_session_order ON proposal (session_id, created_at, id);

CREATE TABLE proposal_part (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposal (id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  base_from INTEGER CHECK (base_from >= 0),
  base_to INTEGER CHECK (base_to >= base_from),
  before_text TEXT NOT NULL DEFAULT '',
  after_text TEXT NOT NULL,
  source_order INTEGER CHECK (source_order >= 0),
  source_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'rejected', 'conflict', 'stale', 'needs-placement')),
  decision_actor TEXT CHECK (decision_actor IN ('user', 'auto')),
  decision_at INTEGER,
  reason TEXT,
  batch_key TEXT,
  UNIQUE (proposal_id, ordinal),
  UNIQUE (batch_key)
);
CREATE INDEX proposal_part_status ON proposal_part (status, proposal_id, ordinal);

CREATE TABLE text_snapshot (
  id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE,
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  before_rev INTEGER NOT NULL CHECK (before_rev >= 0),
  after_rev INTEGER NOT NULL CHECK (after_rev > before_rev),
  before_content TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('user', 'auto')),
  created_at INTEGER NOT NULL,
  undone_at INTEGER
);
CREATE INDEX text_snapshot_chapter_order ON text_snapshot (chapter_id, created_at DESC, id);

CREATE TABLE proposal_accept_command (
  command_id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('parts', 'all')),
  part_ids_json TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('user', 'auto')),
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`

/**
 * Chat actions were stored as Vietnamese codes (`hoi`, `sua`, `ap_dung`); they are now `ask`, `edit`,
 * `apply`. SQLite cannot change a CHECK constraint in place, so `ai_turn` is rebuilt.
 *
 * Dropping the old table fires `proposal.turn_id ON DELETE SET NULL`, which would silently unlink every
 * proposal from its turn. The links are stashed in a temp table first and written back afterwards.
 */
function migrateChatActions(db: Db): void {
  db.exec(`
CREATE TEMP TABLE proposal_turn_link AS SELECT id, turn_id FROM proposal WHERE turn_id IS NOT NULL;

CREATE TABLE ai_turn_next (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_session (id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('ask', 'edit', 'apply')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('sending', 'running', 'done', 'cancelled', 'error', 'interrupted')),
  context_json TEXT NOT NULL DEFAULT '[]',
  target_range_json TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  dropped_turns INTEGER NOT NULL DEFAULT 0 CHECK (dropped_turns >= 0),
  provider TEXT,
  model TEXT,
  usage_json TEXT,
  cost_usd REAL,
  finish_reason TEXT CHECK (finish_reason IN ('stop', 'length', 'tool_calls', 'filter')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO ai_turn_next (
  id, session_id, chapter_id, action, question, answer, status, context_json, target_range_json,
  tools_json, dropped_turns, provider, model, usage_json, cost_usd, finish_reason, created_at, updated_at
)
SELECT
  id, session_id, chapter_id,
  CASE action WHEN 'hoi' THEN 'ask' WHEN 'sua' THEN 'edit' WHEN 'ap_dung' THEN 'apply' ELSE action END,
  question, answer, status, context_json, target_range_json,
  tools_json, dropped_turns, provider, model, usage_json, cost_usd, finish_reason, created_at, updated_at
FROM ai_turn;

DROP TABLE ai_turn;
ALTER TABLE ai_turn_next RENAME TO ai_turn;
CREATE INDEX ai_turn_session_order ON ai_turn (session_id, created_at, id);
CREATE INDEX ai_turn_chapter ON ai_turn (chapter_id, created_at);

UPDATE proposal
SET turn_id = (SELECT link.turn_id FROM proposal_turn_link link WHERE link.id = proposal.id)
WHERE id IN (SELECT id FROM proposal_turn_link);
DROP TABLE proposal_turn_link;
`)
}

/**
 * The approved work context a chapter translation run was planned with, frozen once per run
 * (change `translation-context-snapshot`). Keyed like `proposal.run_key`, but a table of its own: the
 * proposal only appears after the first batch succeeds, and the snapshot must exist before that.
 */
const version9 = `
CREATE TABLE translate_run_context (
  run_key TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX translate_run_context_chapter ON translate_run_context (chapter_id, created_at);
`

/**
 * Chat turns without a mode (change `agentic-chat`): `action` gains `chat`, and a turn records where the
 * user was (`location_json`) instead of a range. SQLite cannot change a CHECK constraint in place, so
 * `ai_turn` is rebuilt the same way `migrateChatActions` did, stashing `proposal.turn_id` first because
 * dropping the old table fires its `ON DELETE SET NULL`.
 */
function migrateAgenticChat(db: Db): void {
  db.exec(`
CREATE TEMP TABLE proposal_turn_link AS SELECT id, turn_id FROM proposal WHERE turn_id IS NOT NULL;

CREATE TABLE ai_turn_next (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_session (id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('ask', 'edit', 'apply', 'chat')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('sending', 'running', 'done', 'cancelled', 'error', 'interrupted')),
  context_json TEXT NOT NULL DEFAULT '[]',
  target_range_json TEXT,
  location_json TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  dropped_turns INTEGER NOT NULL DEFAULT 0 CHECK (dropped_turns >= 0),
  provider TEXT,
  model TEXT,
  usage_json TEXT,
  cost_usd REAL,
  finish_reason TEXT CHECK (finish_reason IN ('stop', 'length', 'tool_calls', 'filter')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO ai_turn_next (
  id, session_id, chapter_id, action, question, answer, status, context_json, target_range_json,
  tools_json, dropped_turns, provider, model, usage_json, cost_usd, finish_reason, created_at, updated_at
)
SELECT
  id, session_id, chapter_id, action, question, answer, status, context_json, target_range_json,
  tools_json, dropped_turns, provider, model, usage_json, cost_usd, finish_reason, created_at, updated_at
FROM ai_turn;

DROP TABLE ai_turn;
ALTER TABLE ai_turn_next RENAME TO ai_turn;
CREATE INDEX ai_turn_session_order ON ai_turn (session_id, created_at, id);
CREATE INDEX ai_turn_chapter ON ai_turn (chapter_id, created_at);

UPDATE proposal
SET turn_id = (SELECT link.turn_id FROM proposal_turn_link link WHERE link.id = proposal.id)
WHERE id IN (SELECT id FROM proposal_turn_link);
DROP TABLE proposal_turn_link;
`)
}

/** What the model thought before answering, shown as "Thought" like Hermes (empty for older turns). */
const version11 = `
ALTER TABLE ai_turn ADD COLUMN reasoning TEXT NOT NULL DEFAULT '';
`

/** Source ownership and an open source-language column (change `source-system-foundation`). */
const version12 = `
ALTER TABLE work RENAME TO work_v11;
CREATE TABLE work (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  original_title TEXT,
  description TEXT,
  cover_path TEXT,
  source_lang TEXT NOT NULL CHECK (length(trim(source_lang)) > 0),
  target_lang TEXT NOT NULL DEFAULT 'vi' CHECK (target_lang = 'vi'),
  status TEXT NOT NULL DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'paused')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  last_chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  author TEXT,
  genre TEXT
);
INSERT INTO work (id, title, original_title, description, cover_path, source_lang, target_lang, status,
  archived, last_chapter_id, created_at, updated_at, author, genre)
SELECT id, title, original_title, description, cover_path, source_lang, target_lang, status, archived,
  last_chapter_id, created_at, updated_at, author, genre FROM work_v11;
DROP TABLE work_v11;
CREATE UNIQUE INDEX work_singleton ON work ((1));

CREATE TABLE source_binding (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL CHECK (length(trim(adapter_id)) > 0),
  adapter_version TEXT NOT NULL CHECK (length(trim(adapter_version)) > 0),
  remote_work_id TEXT NOT NULL CHECK (length(remote_work_id) > 0),
  canonical_url TEXT,
  country_code TEXT,
  language_tag TEXT NOT NULL CHECK (length(trim(language_tag)) > 0),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  auth_profile_id TEXT,
  schedule_policy_json TEXT NOT NULL DEFAULT '{}',
  catalog_cursor_json TEXT,
  last_valid_sync_at INTEGER,
  last_attempt_at INTEGER,
  next_check_at INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (adapter_id, remote_work_id)
);
CREATE UNIQUE INDEX source_binding_primary ON source_binding (is_primary) WHERE is_primary = 1;
CREATE INDEX source_binding_adapter ON source_binding (adapter_id, enabled);
CREATE INDEX source_binding_schedule ON source_binding (enabled, next_check_at);

CREATE TABLE source_sync_run (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL REFERENCES source_binding (id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'import')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'waiting_user')),
  adapter_version TEXT NOT NULL,
  catalog_complete INTEGER NOT NULL DEFAULT 0 CHECK (catalog_complete IN (0, 1)),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  failure_kind TEXT,
  failure_message TEXT,
  stats_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX source_sync_run_binding ON source_sync_run (binding_id, started_at DESC, id);

CREATE TABLE source_catalog_item (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL REFERENCES source_binding (id) ON DELETE CASCADE,
  remote_chapter_id TEXT NOT NULL CHECK (length(remote_chapter_id) > 0),
  remote_url TEXT,
  chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  ordinal_key TEXT NOT NULL,
  volume_title TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  published_at INTEGER,
  remote_updated_at INTEGER,
  revision_token TEXT,
  access_state TEXT NOT NULL CHECK (access_state IN ('public', 'login_required',
    'age_verification_required', 'entitlement_required', 'manual_intervention_required',
    'temporarily_unavailable', 'parser_broken')),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  missing_streak INTEGER NOT NULL DEFAULT 0 CHECK (missing_streak >= 0),
  removed_at INTEGER,
  metadata_hash TEXT NOT NULL,
  UNIQUE (binding_id, remote_chapter_id)
);
CREATE INDEX source_catalog_binding_order ON source_catalog_item (binding_id, ordinal_key, id);
CREATE INDEX source_catalog_chapter ON source_catalog_item (chapter_id) WHERE chapter_id IS NOT NULL;

CREATE TABLE source_content_revision (
  id TEXT PRIMARY KEY,
  catalog_item_id TEXT NOT NULL REFERENCES source_catalog_item (id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  normalization_version INTEGER NOT NULL CHECK (normalization_version > 0),
  remote_updated_at INTEGER,
  fetched_at INTEGER NOT NULL,
  adapter_version TEXT NOT NULL,
  access_state TEXT NOT NULL CHECK (access_state IN ('public', 'login_required',
    'age_verification_required', 'entitlement_required', 'manual_intervention_required',
    'temporarily_unavailable', 'parser_broken')),
  is_complete INTEGER NOT NULL CHECK (is_complete IN (0, 1)),
  UNIQUE (catalog_item_id, content_hash)
);
CREATE INDEX source_content_revision_item ON source_content_revision (catalog_item_id, fetched_at DESC, id);

CREATE TABLE source_update_event (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL REFERENCES source_binding (id) ON DELETE CASCADE,
  catalog_item_id TEXT REFERENCES source_catalog_item (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('added', 'renamed', 'moved', 'access_changed', 'raw_changed',
    'missing_remote', 'reappeared', 'parser_warning')),
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  detected_at INTEGER NOT NULL,
  seen_at INTEGER,
  acted_at INTEGER
);
CREATE INDEX source_update_event_feed ON source_update_event (detected_at DESC, id);
CREATE INDEX source_update_event_binding ON source_update_event (binding_id, detected_at DESC, id);
`

/** Durable evidence for reversible agent writes owned by this work file. */
const version13 = `
CREATE TABLE agent_operation_checkpoint (
  operation_id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('source', 'target')),
  state TEXT NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared', 'applied', 'terminal', 'undone')),
  before_rev INTEGER NOT NULL CHECK (before_rev >= 0),
  before_content TEXT NOT NULL,
  last_applied_rev INTEGER CHECK (last_applied_rev > before_rev),
  applied_units INTEGER NOT NULL DEFAULT 0 CHECK (applied_units >= 0),
  total_units INTEGER NOT NULL CHECK (total_units >= 0),
  terminal_state TEXT CHECK (terminal_state IN
    ('completed', 'partially_completed', 'cancelled', 'conflict', 'failed', 'interrupted', 'undone')),
  terminal_result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terminal_at INTEGER,
  CHECK ((state = 'prepared' AND last_applied_rev IS NULL AND applied_units = 0)
    OR state IN ('applied', 'terminal', 'undone')),
  CHECK ((state IN ('prepared', 'applied') AND terminal_state IS NULL AND terminal_at IS NULL)
    OR (state IN ('terminal', 'undone') AND terminal_state IS NOT NULL AND terminal_at IS NOT NULL))
);
CREATE INDEX agent_operation_checkpoint_target
  ON agent_operation_checkpoint (chapter_id, side, updated_at);

CREATE TABLE agent_operation_batch (
  operation_id TEXT NOT NULL REFERENCES agent_operation_checkpoint (operation_id) ON DELETE CASCADE,
  batch_key TEXT NOT NULL,
  expected_rev INTEGER NOT NULL CHECK (expected_rev >= 0),
  after_rev INTEGER NOT NULL CHECK (after_rev > expected_rev),
  applied_units INTEGER NOT NULL CHECK (applied_units > 0),
  checksum TEXT NOT NULL CHECK (length(checksum) > 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (operation_id, batch_key)
);
CREATE INDEX agent_operation_batch_order
  ON agent_operation_batch (operation_id, created_at, batch_key);
`

/**
 * AI term extraction in the product (change `add-agent-context-workflow`): evidence of where a
 * candidate came from, which chapters were already scanned, the term type for bulk review and review
 * flags (JSON `[{code, detail}]`, shown to the reviewer, never queried).
 */
const version14 = `
ALTER TABLE context_entry ADD COLUMN term_type TEXT;
ALTER TABLE context_entry ADD COLUMN review_flags TEXT NOT NULL DEFAULT '[]';
CREATE TABLE context_entry_evidence (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES context_entry (id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  chapter_id TEXT REFERENCES chapter (id) ON DELETE SET NULL,
  quote TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX context_entry_evidence_entry ON context_entry_evidence (entry_id);
CREATE TABLE context_extraction_scan (
  chapter_id TEXT PRIMARY KEY REFERENCES chapter (id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  scanned_at INTEGER NOT NULL
);
`

/**
 * A person's "ignore this warning" for one paragraph (change `add-translation-task-qa`). Warnings are
 * computed when read and never stored; a dismissal matches only the same rule version and the same target
 * text (`target_hash`), so an edit or a rule change brings the warning back.
 */
const version15 = `
CREATE TABLE qa_dismissal (
  rule_code TEXT NOT NULL,
  rule_version INTEGER NOT NULL CHECK (rule_version > 0),
  chapter_id TEXT NOT NULL REFERENCES chapter (id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (rule_code, rule_version, chapter_id, segment_id, target_hash)
);
`

/**
 * Context review was dropped (change unblock-auto-translate-context): every entry applies once saved, so
 * an entry still waiting for review applies too. `rejected` stays as the record of what not to propose.
 */
const version17 = `
UPDATE context_entry SET status = 'approved' WHERE status = 'pending';
`

/**
 * Chapters downloaded from a source were saved with their text but no segments, and translation
 * needs segments. Give every such source side its segments at its current revision, without raising
 * the revision, so an open editor or a pinned task sees no change.
 */
function segmentBareSources(db: Db): void {
  const lang = db
    .prepare('SELECT source_lang FROM work')
    .get<{ source_lang: string }>()?.source_lang
  if (!lang) return
  const bare = db
    .prepare(
      `SELECT chapter_id, content, rev FROM chapter_text t WHERE side = 'source'
       AND trim(content) != ''
       AND NOT EXISTS (SELECT 1 FROM segment s WHERE s.chapter_id = t.chapter_id AND s.side = 'source')`
    )
    .all<{ chapter_id: string; content: string; rev: number }>()
  const insert = db.prepare(
    `INSERT INTO segment (id, chapter_id, side, position, start_offset, end_offset, text_rev, status)
     VALUES (?, ?, 'source', ?, ?, ?, ?, 'ok')`
  )
  for (const row of bare) {
    segment(row.content, lang).forEach((range, position) => {
      insert.run(randomUUID(), row.chapter_id, position, range.start, range.end, row.rev)
    })
  }
}

/** Kana reading of an extracted term (change `improve-glossary-extraction`); never sent to translation. */
const version18 = `
ALTER TABLE context_entry ADD COLUMN reading TEXT;
`

export const workSchema: SchemaSpec = {
  applicationId: WORK_APPLICATION_ID,
  migrations: [
    {
      version: 1,
      up(db) {
        db.exec(version1)
        db.exec('PRAGMA application_id = ' + WORK_APPLICATION_ID)
      }
    },
    {
      version: 2,
      up(db) {
        db.exec(version2)
      }
    },
    {
      version: 3,
      up(db) {
        db.exec(version3)
      }
    },
    {
      version: 4,
      up(db) {
        db.exec(version4)
      }
    },
    {
      version: 5,
      up(db) {
        db.exec(version5)
      }
    },
    {
      version: 6,
      up(db) {
        db.exec(version6)
      }
    },
    {
      version: 7,
      up(db) {
        db.exec(version7)
      }
    },
    {
      version: 8,
      up(db) {
        migrateChatActions(db)
      }
    },
    {
      version: 9,
      up(db) {
        db.exec(version9)
      }
    },
    {
      version: 10,
      up(db) {
        migrateAgenticChat(db)
      }
    },
    {
      version: 11,
      up(db) {
        db.exec(version11)
      }
    },
    {
      version: 12,
      up(db) {
        db.exec(version12)
      }
    },
    {
      version: 13,
      up(db) {
        db.exec(version13)
      }
    },
    {
      version: 14,
      up(db) {
        db.exec(version14)
      }
    },
    {
      version: 15,
      up(db) {
        db.exec(version15)
      }
    },
    {
      version: 16,
      up(db) {
        segmentBareSources(db)
      }
    },
    {
      version: 17,
      up(db) {
        db.exec(version17)
      }
    },
    {
      version: 18,
      up(db) {
        db.exec(version18)
      }
    }
  ]
}
