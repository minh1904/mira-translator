-- index agent_activity_turn_order
CREATE INDEX agent_activity_turn_order ON agent_activity (turn_id, step_seq);

-- index agent_operation_state
CREATE INDEX agent_operation_state ON agent_operation (state, updated_at);

-- index agent_operation_task_item
CREATE INDEX agent_operation_task_item ON agent_operation (task_item_id, created_at);

-- index agent_operation_turn_order
CREATE INDEX agent_operation_turn_order ON agent_operation (turn_id, created_at, id);

-- index agent_session_updated
CREATE INDEX agent_session_updated ON agent_session (updated_at DESC, id);

-- index agent_task_item_one_running
CREATE UNIQUE INDEX agent_task_item_one_running ON agent_task_item ((1)) WHERE state = 'running';

-- index agent_task_order
CREATE INDEX agent_task_order ON agent_task (created_at, id);

-- index agent_task_steering_task
CREATE INDEX agent_task_steering_task ON agent_task_steering (task_id, created_at, id);

-- index agent_task_work
CREATE INDEX agent_task_work ON agent_task (work_id, created_at);

-- index agent_tool_call_turn_order
CREATE INDEX agent_tool_call_turn_order ON agent_tool_call (turn_id, round, created_at);

-- index agent_turn_client_command
CREATE UNIQUE INDEX agent_turn_client_command ON agent_turn (client_command_id)
  WHERE client_command_id IS NOT NULL;

-- index agent_turn_one_active
CREATE UNIQUE INDEX agent_turn_one_active ON agent_turn (session_id)
  WHERE status IN ('queued', 'running', 'waiting_user');

-- index agent_turn_session_order
CREATE INDEX agent_turn_session_order ON agent_turn (session_id, created_at, id);

-- index ai_connection_oauth_provider
CREATE UNIQUE INDEX ai_connection_oauth_provider ON ai_connection (oauth_provider)
  WHERE oauth_provider IS NOT NULL;

-- index ai_connection_ord
CREATE INDEX ai_connection_ord ON ai_connection (ord);

-- index ai_key_connection
CREATE INDEX ai_key_connection ON ai_key (connection_id, ord);

-- index ai_model_connection
CREATE INDEX ai_model_connection ON ai_model (connection_id, ord);

-- index source_auth_profile_adapter
CREATE INDEX source_auth_profile_adapter ON source_auth_profile (adapter_id);

-- index source_job_work_binding
CREATE INDEX source_job_work_binding ON source_job (work_id, binding_id, kind);

-- index source_schedule_index_next
CREATE INDEX source_schedule_index_next ON source_schedule_index (enabled, next_check_at);

-- index work_index_updated
CREATE INDEX work_index_updated ON work_index (updated_at DESC);

-- table agent_activity
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

-- table agent_legacy_import
CREATE TABLE agent_legacy_import (
  work_id TEXT NOT NULL,
  legacy_session_id TEXT NOT NULL,
  agent_session_id TEXT NOT NULL REFERENCES agent_session (id) ON DELETE CASCADE,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (work_id, legacy_session_id),
  UNIQUE (agent_session_id)
);

-- table agent_legacy_turn_import
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

-- table agent_operation
CREATE TABLE "agent_operation" (
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

-- table agent_session
CREATE TABLE agent_session (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, permission_level TEXT NOT NULL DEFAULT 'default'
  CHECK (permission_level IN ('default', 'allow_all', 'autopilot')));

-- table agent_session_approval
CREATE TABLE agent_session_approval (
  session_id TEXT NOT NULL REFERENCES agent_session (id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, capability)
);

-- table agent_task
CREATE TABLE agent_task (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('translate_chapters')),
  work_id TEXT NOT NULL,
  origin_turn_id TEXT REFERENCES agent_turn (id) ON DELETE SET NULL,
  source_task_id TEXT REFERENCES agent_task (id) ON DELETE SET NULL,
  client_command_id TEXT NOT NULL UNIQUE,
  payload_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'pausing', 'paused', 'waiting_user', 'cancelling',
    'cancelled', 'completed', 'partially_completed', 'failed')),
  reason TEXT CHECK (reason IN ('missing_raw', 'conflict', 'budget', 'provider', 'refused', 'context_review',
    'app_closed', 'recovered_after_restart', 'user')),
  model_ref_json TEXT NOT NULL,
  overwrite_policy TEXT NOT NULL CHECK (overwrite_policy IN ('fill_untranslated')),
  options_json TEXT NOT NULL DEFAULT '{}',
  budget_json TEXT NOT NULL DEFAULT '{}',
  state_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (reason IS NULL OR state IN ('waiting_user', 'paused', 'failed'))
);

-- table agent_task_attempt
CREATE TABLE agent_task_attempt (
  item_id TEXT NOT NULL REFERENCES agent_task_item (id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  operation_id TEXT NOT NULL UNIQUE REFERENCES agent_operation (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, attempt)
);

-- table agent_task_item
CREATE TABLE agent_task_item (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_task (id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  chapter_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'waiting_user', 'completed', 'failed', 'skipped', 'cancelled')),
  reason TEXT CHECK (reason IN ('missing_raw', 'conflict', 'budget', 'provider', 'refused', 'context_review',
    'app_closed', 'recovered_after_restart', 'user')),
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

-- table agent_task_steering
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

-- table agent_tool_call
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
  created_at INTEGER NOT NULL, extra_json TEXT, approval TEXT
  CHECK (approval IN ('user_once', 'user_session', 'level_allow_all', 'level_autopilot',
    'autopilot_skip')),
  UNIQUE (turn_id, call_id)
);

-- table agent_turn
CREATE TABLE "agent_turn" (
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
, mode TEXT NOT NULL DEFAULT 'agent'
  CHECK (mode IN ('ask', 'agent')), permission_level TEXT NOT NULL DEFAULT 'default'
  CHECK (permission_level IN ('default', 'allow_all', 'autopilot')));

-- table ai_connection
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
, auth_kind TEXT NOT NULL DEFAULT 'api_key'
  CHECK (auth_kind IN ('api_key', 'oauth')), oauth_provider TEXT
  CHECK (oauth_provider IN ('codex', 'copilot')), api_mode TEXT NOT NULL DEFAULT 'auto'
  CHECK (api_mode IN ('auto', 'chat_completions', 'responses', 'anthropic_messages')));

-- table ai_key
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

-- table ai_model
CREATE TABLE ai_model (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES ai_connection (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}'
);

-- table ai_oauth_token
CREATE TABLE ai_oauth_token (
  connection_id TEXT PRIMARY KEY REFERENCES ai_connection (id) ON DELETE CASCADE,
  secret BLOB NOT NULL,
  expires_at INTEGER,
  account_label TEXT,
  state TEXT NOT NULL DEFAULT 'ok' CHECK (state IN ('ok', 'relogin')),
  updated_at INTEGER NOT NULL
);

-- table meta
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- table source_adapter_install
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

-- table source_auth_profile
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

-- table source_job
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

-- table source_schedule_index
CREATE TABLE source_schedule_index (
  work_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  next_check_at INTEGER,
  priority INTEGER NOT NULL,
  last_result TEXT NOT NULL,
  PRIMARY KEY (work_id, binding_id)
);

-- table work_index
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
, author TEXT, genre TEXT, cover_version INTEGER);
