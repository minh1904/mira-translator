import { randomUUID } from 'node:crypto'
import type { SchemaSpec } from './migrate'
import type { Db } from './sqlite'

/** "MIRL" in ASCII: the library index, distinct from work files. */
export const LIBRARY_APPLICATION_ID = 0x4d49524c

/**
 * The index is a cache of what work files say, so it can always be rebuilt from `works/*.mira`.
 * It exists only to list works without opening every file.
 */
const version1 = `
CREATE TABLE work_index (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  original_title TEXT,
  description TEXT,
  source_lang TEXT NOT NULL,
  status TEXT NOT NULL,
  archived INTEGER NOT NULL,
  chapter_count INTEGER NOT NULL,
  last_chapter_id TEXT,
  last_chapter_number INTEGER,
  last_chapter_title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX work_index_updated ON work_index (updated_at DESC);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

const version2 = `
ALTER TABLE work_index ADD COLUMN author TEXT;
ALTER TABLE work_index ADD COLUMN genre TEXT;
`

const version3 = `
ALTER TABLE work_index ADD COLUMN cover_version INTEGER;
`

/**
 * Kết nối AI thuộc cả ứng dụng, không thuộc một tác phẩm: khai lại cho mỗi truyện là vô lý, và một
 * tệp `.mira` mang khóa API đi theo lúc backup hay gửi cho người khác là rò rỉ (D3 của change
 * `ai-connection`). `secret` là bản mã của `safeStorage`; khóa dạng rõ không bao giờ nằm ở đây.
 */
const version4 = `
CREATE TABLE ai_connection (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  provider_id TEXT,
  default_model TEXT,
  checked_at INTEGER,
  ord INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ai_connection_ord ON ai_connection (ord);

CREATE TABLE ai_key (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES ai_connection (id) ON DELETE CASCADE,
  secret BLOB NOT NULL,
  tail TEXT NOT NULL,
  ord INTEGER NOT NULL,
  state TEXT NOT NULL,
  frozen_until INTEGER,
  frozen_scope TEXT,
  freeze_strikes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_key_connection ON ai_key (connection_id, ord);

CREATE TABLE ai_model (
  connection_id TEXT NOT NULL REFERENCES ai_connection (id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (connection_id, model_id)
);
`

const version5Table = `
CREATE TABLE ai_model (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES ai_connection (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX ai_model_connection ON ai_model (connection_id, ord);
`

/**
 * Model là một **mục** có id riêng, nhân bản được, thay cho cặp `(kết nối, tên model)` (design D1–D2 của
 * change `ai-model-settings`). Hai mục cùng `model_id` hợp lệ, nên khóa chính cũ phải bỏ; SQLite không đổi
 * khóa chính tại chỗ nên bảng được dựng lại. Viết bằng hàm chứ không phải một chuỗi SQL vì mỗi mục cần một
 * uuid, và vì `ai_connection.default_model` (trước là tên model) phải đổi thành id của mục tương ứng.
 *
 * Chạy trong transaction của `migrate`, cùng với việc nâng `user_version`: hỏng giữa chừng thì tệp ở nguyên
 * v4. Mọi mục sinh ra có `settings = '{}'`, tức không gửi gì thêm, nên hành vi không đổi cho tới khi người
 * dùng đặt một tham số.
 */
function version5(db: Db): void {
  const oldModels = db
    .prepare('SELECT connection_id, model_id, ord FROM ai_model ORDER BY connection_id, ord')
    .all<{ connection_id: string; model_id: string; ord: number }>()
  const connections = db
    .prepare('SELECT id, default_model FROM ai_connection')
    .all<{ id: string; default_model: string | null }>()

  db.exec('DROP TABLE ai_model')
  db.exec(version5Table)

  const insert = db.prepare(
    'INSERT INTO ai_model (id, connection_id, name, model_id, ord, settings) VALUES (?, ?, ?, ?, ?, ?)'
  )
  // Mục đầu tiên của mỗi (kết nối, tên model) cũ; dùng để tìm mục mà model mặc định cũ trỏ tới.
  const entryOf = new Map<string, string>()
  const nextOrd = new Map<string, number>()
  const key = (connectionId: string, modelId: string): string => connectionId + '\u0000' + modelId

  for (const row of oldModels) {
    const id = randomUUID()
    insert.run(id, row.connection_id, row.model_id, row.model_id, row.ord, '{}')
    entryOf.set(key(row.connection_id, row.model_id), id)
    nextOrd.set(row.connection_id, Math.max(nextOrd.get(row.connection_id) ?? 0, row.ord + 1))
  }

  const setDefault = db.prepare('UPDATE ai_connection SET default_model = ? WHERE id = ?')
  for (const connection of connections) {
    const modelId = connection.default_model
    if (modelId === null) continue
    if (modelId === '') {
      setDefault.run(null, connection.id)
      continue
    }
    let id = entryOf.get(key(connection.id, modelId))
    if (id === undefined) {
      // Model mặc định không nằm trong danh sách đã chọn (trước đây vẫn dùng được, `targetsOf` đưa nó vào
      // danh sách dịch). Giữ nó dùng được bằng cách tạo mục cho nó, thay vì âm thầm mất mặc định.
      id = randomUUID()
      const ord = nextOrd.get(connection.id) ?? 0
      insert.run(id, connection.id, modelId, modelId, ord, '{}')
      nextOrd.set(connection.id, ord + 1)
    }
    setDefault.run(id, connection.id)
  }
}

/**
 * Ollama gets its own provider id, so Settings › Kết nối AI can file it under "Trên máy" without sniffing
 * the address (change `hermes-settings-modal`, design D4). Only connections that are still on the preset's
 * own address are tagged: one the person pointed elsewhere is theirs to name.
 */
const version6 = `
UPDATE ai_connection SET provider_id = 'ollama'
WHERE provider_id IS NULL AND rtrim(base_url, '/') IN ('http://127.0.0.1:11434/v1', 'http://localhost:11434/v1');
`

/**
 * Account logins (change `subscription-providers`, design D7). A connection is reached with an API key or an
 * account; an account's tokens live in their own table, sealed by `safeStorage` like keys, and there is at
 * most one connection per account provider. `api_mode` says which wire protocol a connection speaks; the
 * default `auto` keeps every existing connection on Chat Completions.
 */
const version7 = `
ALTER TABLE ai_connection ADD COLUMN auth_kind TEXT NOT NULL DEFAULT 'api_key'
  CHECK (auth_kind IN ('api_key', 'oauth'));
ALTER TABLE ai_connection ADD COLUMN oauth_provider TEXT
  CHECK (oauth_provider IN ('codex', 'copilot'));
ALTER TABLE ai_connection ADD COLUMN api_mode TEXT NOT NULL DEFAULT 'auto'
  CHECK (api_mode IN ('auto', 'chat_completions', 'responses', 'anthropic_messages'));
CREATE UNIQUE INDEX ai_connection_oauth_provider ON ai_connection (oauth_provider)
  WHERE oauth_provider IS NOT NULL;

CREATE TABLE ai_oauth_token (
  connection_id TEXT PRIMARY KEY REFERENCES ai_connection (id) ON DELETE CASCADE,
  secret BLOB NOT NULL,
  expires_at INTEGER,
  account_label TEXT,
  state TEXT NOT NULL DEFAULT 'ok' CHECK (state IN ('ok', 'relogin')),
  updated_at INTEGER NOT NULL
);
`

const version8 = `
CREATE TABLE source_adapter_install (
  adapter_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  trust_level TEXT NOT NULL CHECK (trust_level IN ('builtin', 'official', 'untrusted')),
  state TEXT NOT NULL CHECK (state IN ('enabled', 'disabled', 'deprecated', 'incompatible')),
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE source_auth_profile (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL REFERENCES source_adapter_install (adapter_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  encrypted_secret BLOB NOT NULL,
  account_partition TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ok', 'relogin', 'expired')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX source_auth_profile_adapter ON source_auth_profile (adapter_id);

CREATE TABLE source_job (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'waiting_user')),
  attempt INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX source_job_work_binding ON source_job (work_id, binding_id, kind);

CREATE TABLE source_schedule_index (
  work_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  next_check_at INTEGER,
  priority INTEGER NOT NULL,
  last_result TEXT NOT NULL,
  PRIMARY KEY (work_id, binding_id)
);
CREATE INDEX source_schedule_index_next ON source_schedule_index (enabled, next_check_at);
`

/** App-scoped agent orchestration. Work/chapter references remain soft across files. */
const version9 = `
CREATE TABLE agent_session (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX agent_session_updated ON agent_session (updated_at DESC, id);

CREATE TABLE agent_turn (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_session (id) ON DELETE CASCADE,
  instruction TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  reasoning TEXT NOT NULL DEFAULT '',
  context_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN
    ('queued', 'running', 'completed', 'waiting_user', 'failed', 'cancelled', 'interrupted')),
  usage_json TEXT,
  cost_usd REAL,
  legacy_ref_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX agent_turn_session_order ON agent_turn (session_id, created_at, id);
CREATE UNIQUE INDEX agent_turn_one_active ON agent_turn (session_id)
  WHERE status IN ('queued', 'running');

CREATE TABLE agent_operation (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  command_id TEXT NOT NULL UNIQUE,
  capability TEXT NOT NULL,
  target_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'partially_completed',
    'conflict', 'failed', 'cancelled', 'interrupted', 'undone')),
  progress_json TEXT,
  model_ref_json TEXT,
  usage_json TEXT,
  result_json TEXT,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX agent_operation_turn_order ON agent_operation (turn_id, created_at, id);
CREATE INDEX agent_operation_state ON agent_operation (state, updated_at);

CREATE TABLE agent_activity (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  operation_id TEXT REFERENCES agent_operation (id) ON DELETE SET NULL,
  step_seq INTEGER NOT NULL CHECK (step_seq > 0),
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  label TEXT NOT NULL,
  detail_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (turn_id, step_seq)
);
CREATE INDEX agent_activity_turn_order ON agent_activity (turn_id, step_seq);

CREATE TABLE agent_legacy_import (
  work_id TEXT NOT NULL,
  legacy_session_id TEXT NOT NULL,
  agent_session_id TEXT NOT NULL REFERENCES agent_session (id) ON DELETE CASCADE,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (work_id, legacy_session_id),
  UNIQUE (agent_session_id)
);

CREATE TABLE agent_legacy_turn_import (
  work_id TEXT NOT NULL,
  legacy_session_id TEXT NOT NULL,
  legacy_turn_id TEXT NOT NULL,
  agent_turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (work_id, legacy_session_id, legacy_turn_id),
  UNIQUE (agent_turn_id),
  FOREIGN KEY (work_id, legacy_session_id)
    REFERENCES agent_legacy_import (work_id, legacy_session_id) ON DELETE CASCADE
);
`

const version10 = `
ALTER TABLE agent_turn ADD COLUMN client_command_id TEXT;
ALTER TABLE agent_turn ADD COLUMN payload_digest TEXT;
CREATE UNIQUE INDEX agent_turn_client_command ON agent_turn (client_command_id)
  WHERE client_command_id IS NOT NULL;
`

/**
 * Vòng model–tool của Trợ lý (change `add-agent-conversation`, D2): mỗi tool call được lưu cùng quyết
 * định policy trước khi chạy, và hàng `needs_user` còn `pending` là pending action. SQLite không sửa CHECK
 * tại chỗ nên `agent_turn` được dựng lại để có `expired` và để index một-turn-active tính cả
 * `waiting_user`; migration chạy với `foreignKeysOff` để operation/activity không bị cascade xóa.
 */
const version11 = `
CREATE TABLE agent_turn_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_session (id) ON DELETE CASCADE,
  instruction TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  reasoning TEXT NOT NULL DEFAULT '',
  context_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'waiting_user', 'failed',
    'cancelled', 'interrupted', 'expired')),
  usage_json TEXT,
  cost_usd REAL,
  legacy_ref_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  client_command_id TEXT,
  payload_digest TEXT
);
INSERT INTO agent_turn_new SELECT * FROM agent_turn;
DROP TABLE agent_turn;
ALTER TABLE agent_turn_new RENAME TO agent_turn;
CREATE INDEX agent_turn_session_order ON agent_turn (session_id, created_at, id);
CREATE UNIQUE INDEX agent_turn_one_active ON agent_turn (session_id)
  WHERE status IN ('queued', 'running', 'waiting_user');
CREATE UNIQUE INDEX agent_turn_client_command ON agent_turn (client_command_id)
  WHERE client_command_id IS NOT NULL;

CREATE TABLE agent_tool_call (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  round INTEGER NOT NULL CHECK (round > 0),
  call_id TEXT NOT NULL,
  name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  args_digest TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'needs_user')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'failed', 'cancelled', 'expired')),
  result_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (turn_id, call_id)
);
CREATE INDEX agent_tool_call_turn_order ON agent_tool_call (turn_id, round, created_at);
`

const TASK_STATES = `'queued', 'running', 'pausing', 'paused', 'waiting_user', 'cancelling',
    'cancelled', 'completed', 'partially_completed', 'failed'`
const ITEM_STATES = `'queued', 'running', 'waiting_user', 'completed', 'failed', 'skipped', 'cancelled'`
const TASK_REASONS = `'missing_raw', 'conflict', 'budget', 'provider', 'refused', 'context_review',
    'app_closed', 'recovered_after_restart', 'user'`

/**
 * Task dịch dải chương lưu bền (change `add-durable-translation-tasks`). Mỗi lần chạy item là một
 * `agent_operation` mới không thuộc turn nào, nên bảng đó được dựng lại với `turn_id` nullable và đúng một
 * chủ sở hữu; `foreignKeysOff` giữ `agent_activity.operation_id` khỏi bị `ON DELETE SET NULL`.
 */
const version12 = `
CREATE TABLE agent_task (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('translate_chapters')),
  work_id TEXT NOT NULL,
  origin_turn_id TEXT REFERENCES agent_turn (id) ON DELETE SET NULL,
  source_task_id TEXT REFERENCES agent_task (id) ON DELETE SET NULL,
  client_command_id TEXT NOT NULL UNIQUE,
  payload_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (${TASK_STATES})),
  reason TEXT CHECK (reason IN (${TASK_REASONS})),
  model_ref_json TEXT NOT NULL,
  overwrite_policy TEXT NOT NULL CHECK (overwrite_policy IN ('fill_untranslated')),
  options_json TEXT NOT NULL DEFAULT '{}',
  budget_json TEXT NOT NULL DEFAULT '{}',
  state_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (reason IS NULL OR state IN ('waiting_user', 'paused', 'failed'))
);
CREATE INDEX agent_task_order ON agent_task (created_at, id);
CREATE INDEX agent_task_work ON agent_task (work_id, created_at);

CREATE TABLE agent_task_item (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_task (id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  chapter_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (${ITEM_STATES})),
  reason TEXT CHECK (reason IN (${TASK_REASONS})),
  run_key TEXT,
  source_rev INTEGER,
  expected_target_rev INTEGER,
  skipped_segments_json TEXT NOT NULL DEFAULT '[]',
  progress_json TEXT NOT NULL DEFAULT '{}',
  context_changed INTEGER NOT NULL DEFAULT 0 CHECK (context_changed IN (0, 1)),
  state_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (task_id, ordinal),
  UNIQUE (task_id, chapter_id),
  CHECK (reason IS NULL OR state IN ('waiting_user', 'failed'))
);
CREATE UNIQUE INDEX agent_task_item_one_running ON agent_task_item ((1)) WHERE state = 'running';

CREATE TABLE agent_operation_new (
  id TEXT PRIMARY KEY,
  turn_id TEXT REFERENCES agent_turn (id) ON DELETE CASCADE,
  command_id TEXT NOT NULL UNIQUE,
  capability TEXT NOT NULL,
  target_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'partially_completed',
    'conflict', 'failed', 'cancelled', 'interrupted', 'undone')),
  progress_json TEXT,
  model_ref_json TEXT,
  usage_json TEXT,
  result_json TEXT,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  task_item_id TEXT REFERENCES agent_task_item (id) ON DELETE CASCADE,
  CHECK ((turn_id IS NULL) <> (task_item_id IS NULL))
);
INSERT INTO agent_operation_new
  (id, turn_id, command_id, capability, target_json, state, progress_json, model_ref_json, usage_json,
   result_json, error_json, created_at, updated_at)
  SELECT id, turn_id, command_id, capability, target_json, state, progress_json, model_ref_json,
    usage_json, result_json, error_json, created_at, updated_at FROM agent_operation;
DROP TABLE agent_operation;
ALTER TABLE agent_operation_new RENAME TO agent_operation;
CREATE INDEX agent_operation_turn_order ON agent_operation (turn_id, created_at, id);
CREATE INDEX agent_operation_state ON agent_operation (state, updated_at);
CREATE INDEX agent_operation_task_item ON agent_operation (task_item_id, created_at);

CREATE TABLE agent_task_attempt (
  item_id TEXT NOT NULL REFERENCES agent_task_item (id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  operation_id TEXT NOT NULL UNIQUE REFERENCES agent_operation (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, attempt)
);
`

/**
 * Steering of a durable task (change `add-agent-steering`): an accepted change that applies from
 * `resolved_from_item_id` on. Refused commands leave no row; `client_command_id` dedupes resends.
 */
const version13 = `
CREATE TABLE agent_task_steering (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_task (id) ON DELETE CASCADE,
  client_command_id TEXT NOT NULL UNIQUE,
  payload_digest TEXT NOT NULL,
  requested_chapter_id TEXT NOT NULL,
  resolved_from_item_id TEXT NOT NULL REFERENCES agent_task_item (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('instruction', 'context_ref')),
  instruction_text TEXT,
  context_ref_json TEXT,
  state TEXT NOT NULL DEFAULT 'accepted' CHECK (state IN ('accepted', 'applied', 'superseded')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((kind = 'instruction') = (instruction_text IS NOT NULL)),
  CHECK ((kind = 'context_ref') = (context_ref_json IS NOT NULL))
);
CREATE INDEX agent_task_steering_task ON agent_task_steering (task_id, created_at, id);
`

/**
 * Chế độ và mức quyền của chat (change `fix-agent-chat-permissions`): turn lưu chế độ và chụp mức quyền
 * của session lúc được chấp nhận; `approval` ghi vì sao một call `needs_user` được chạy hoặc bị bỏ qua.
 */
const version15 = `
ALTER TABLE agent_turn ADD COLUMN mode TEXT NOT NULL DEFAULT 'agent'
  CHECK (mode IN ('ask', 'agent'));
ALTER TABLE agent_turn ADD COLUMN permission_level TEXT NOT NULL DEFAULT 'default'
  CHECK (permission_level IN ('default', 'allow_all', 'autopilot'));
ALTER TABLE agent_session ADD COLUMN permission_level TEXT NOT NULL DEFAULT 'default'
  CHECK (permission_level IN ('default', 'allow_all', 'autopilot'));
ALTER TABLE agent_tool_call ADD COLUMN approval TEXT
  CHECK (approval IN ('user_once', 'user_session', 'level_allow_all', 'level_autopilot',
    'autopilot_skip'));
CREATE TABLE agent_session_approval (
  session_id TEXT NOT NULL REFERENCES agent_session (id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, capability)
);
`

/**
 * Câu trả lời thành chuỗi phần tử (change `add-agent-response-parts`): chữ và suy nghĩ của từng vòng,
 * tham chiếu tool call và thông báo tiến trình, theo thứ tự xảy ra. Tool call của subagent mang
 * `parent_call_id` của call `run_subagent`; `messages_json` giữ câu mô tả lúc call được lưu.
 */
const version16 = `
CREATE TABLE agent_turn_part (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  round INTEGER NOT NULL CHECK (round >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('text', 'reasoning', 'tool_call', 'progress')),
  text TEXT NOT NULL DEFAULT '',
  tool_call_id TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (turn_id, seq),
  CHECK ((kind = 'tool_call') = (tool_call_id IS NOT NULL))
);
ALTER TABLE agent_tool_call ADD COLUMN parent_call_id TEXT;
ALTER TABLE agent_tool_call ADD COLUMN messages_json TEXT;
ALTER TABLE agent_turn ADD COLUMN model_label TEXT;
CREATE INDEX agent_tool_call_parent ON agent_tool_call (parent_call_id)
  WHERE parent_call_id IS NOT NULL;
`

// Chương đã sửa được giữ, và lượt đã khôi phục về checkpoint (ẩn khỏi transcript và prompt).
const version17 = `
ALTER TABLE agent_operation ADD COLUMN kept_at INTEGER;
ALTER TABLE agent_turn ADD COLUMN reverted_at INTEGER;
`

// Bản tóm tắt lịch sử chat của session (change `add-agent-session-memory`): một bản mỗi session.
const version18 = `
CREATE TABLE agent_session_summary (
  session_id TEXT PRIMARY KEY REFERENCES agent_session (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  covered_turn_ids_json TEXT NOT NULL,
  model_label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`

// Change add-agent-turn-steering D1: messages typed while a turn runs wait in agent_turn_steer and
// become a 'steer' part once delivered. SQLite cannot widen a CHECK in place, so the part table is
// rebuilt; nothing references it.
const version19 = `
CREATE TABLE agent_turn_steer (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'withdrawn', 'returned', 'forwarded')),
  delivered_round INTEGER,
  forwarded_turn_id TEXT REFERENCES agent_turn (id) ON DELETE SET NULL,
  client_command_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (turn_id, seq),
  UNIQUE (turn_id, client_command_id)
);
CREATE TABLE agent_turn_part_new (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turn (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  round INTEGER NOT NULL CHECK (round >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('text', 'reasoning', 'tool_call', 'progress', 'steer')),
  text TEXT NOT NULL DEFAULT '',
  tool_call_id TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (turn_id, seq),
  CHECK ((kind = 'tool_call') = (tool_call_id IS NOT NULL))
);
INSERT INTO agent_turn_part_new SELECT * FROM agent_turn_part;
DROP TABLE agent_turn_part;
ALTER TABLE agent_turn_part_new RENAME TO agent_turn_part;
`

const version21 = `
ALTER TABLE work_index ADD COLUMN setting TEXT;
ALTER TABLE work_index ADD COLUMN settings_extra TEXT;
ALTER TABLE work_index ADD COLUMN culture TEXT;
`

export const librarySchema: SchemaSpec = {
  applicationId: LIBRARY_APPLICATION_ID,
  migrations: [
    {
      version: 1,
      up(db) {
        db.exec(version1)
        db.exec('PRAGMA application_id = ' + LIBRARY_APPLICATION_ID)
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
      up: version5
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
        db.exec(version8)
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
        db.exec(version10)
      }
    },
    {
      version: 11,
      foreignKeysOff: true,
      up(db) {
        db.exec(version11)
      }
    },
    {
      version: 12,
      foreignKeysOff: true,
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
        db.exec('ALTER TABLE agent_tool_call ADD COLUMN extra_json TEXT')
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
        db.exec(version16)
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
    },
    {
      version: 19,
      up(db) {
        db.exec(version19)
      }
    },
    {
      // Change `parallelize-task-chapters`: several task items run at once, bounded by the scheduler.
      version: 20,
      up(db) {
        db.exec('DROP INDEX agent_task_item_one_running')
      }
    },
    {
      // Change `add-multilingual-addressing-presets`: the index mirrors the work file's story profile.
      version: 21,
      up(db) {
        db.exec(version21)
      }
    }
  ]
}
