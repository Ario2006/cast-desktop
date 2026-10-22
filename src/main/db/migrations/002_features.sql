-- Per-input-shape action choices ("remind me" -> reminder.create). Stores a coarse shape, never the text.
CREATE TABLE choice_stats (
  shape      TEXT NOT NULL,
  action_id  TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  last_used  INTEGER NOT NULL,
  PRIMARY KEY (shape, action_id)
);

CREATE TABLE snippets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- At most one Pomodoro session; it drives ordinary timers phase by phase.
CREATE TABLE pomodoro (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  phase       TEXT NOT NULL CHECK (phase IN ('focus','short','long')),
  cycle       INTEGER NOT NULL,
  timer_id    INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  started_at  INTEGER NOT NULL
);
