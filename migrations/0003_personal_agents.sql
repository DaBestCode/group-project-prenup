CREATE TABLE personal_agents (
  room_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'online',
  policy_json TEXT NOT NULL,
  last_evaluation_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, participant_id),
  FOREIGN KEY (room_id, participant_id) REFERENCES participants(room_id, id) ON DELETE CASCADE
);

CREATE INDEX personal_agents_room_state ON personal_agents(room_id, state);
