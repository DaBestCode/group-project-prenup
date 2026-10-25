CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  expected_members INTEGER NOT NULL CHECK (expected_members BETWEEN 2 AND 6),
  status TEXT NOT NULL DEFAULT 'lobby',
  round INTEGER NOT NULL DEFAULT 0,
  proposal_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE participants (
  room_id TEXT NOT NULL,
  id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  approval TEXT NOT NULL DEFAULT 'pending',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, id),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX participants_room_id ON participants(room_id);
