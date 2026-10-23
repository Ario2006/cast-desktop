CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  text         TEXT NOT NULL,
  due_at       INTEGER,              -- epoch ms, optional
  done_at      INTEGER,              -- epoch ms when completed
  reminder_id  INTEGER,              -- reminder created for a timed due date
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_tasks_open ON tasks(done_at, due_at);

CREATE TABLE time_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER                -- null while running
);
CREATE INDEX idx_time_started ON time_entries(started_at);

CREATE TABLE quicklinks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword     TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,          -- may contain {query}
  created_at  INTEGER NOT NULL
);
