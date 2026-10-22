-- Key/value settings (non-secret)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- JSON-encoded
);

-- Timers and stopwatches share one table
CREATE TABLE timers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kind             TEXT NOT NULL CHECK (kind IN ('timer','stopwatch')),
  label            TEXT,
  duration_ms      INTEGER,          -- timers only
  started_at       INTEGER,          -- epoch ms (null if paused/not started)
  accumulated_ms   INTEGER NOT NULL DEFAULT 0,
  state            TEXT NOT NULL CHECK (state IN ('running','paused','done','cancelled')),
  laps_json        TEXT,             -- stopwatch laps
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_timers_state ON timers(state);

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  body        TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='id');

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TABLE reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT NOT NULL,
  remind_at   INTEGER NOT NULL,      -- epoch ms
  repeat      TEXT,                  -- null | 'daily' | 'weekly'
  state       TEXT NOT NULL CHECK (state IN ('pending','fired','done','snoozed')),
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_reminders_due ON reminders(state, remind_at);

-- Powers "recent" and frequency ranking. Stores no raw keystrokes.
CREATE TABLE action_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id   TEXT NOT NULL,
  summary     TEXT,                  -- e.g. "Timer 25m"
  used_at     INTEGER NOT NULL
);
CREATE INDEX idx_history_action ON action_history(action_id, used_at DESC);

-- Captures metadata (files live on disk)
CREATE TABLE captures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('screenshot','recording')),
  path        TEXT NOT NULL,
  duration_ms INTEGER,
  created_at  INTEGER NOT NULL
);
