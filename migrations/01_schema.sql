CREATE TABLE contributor (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,

  created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp
);

INSERT INTO contributor (id, email, password) VALUES (0, 'anonymous', '');

CREATE TABLE sign (
  id SERIAL PRIMARY KEY,
  gloss TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  contributor_id INTEGER NOT NULL DEFAULT 0 REFERENCES contributor(id) ON DELETE CASCADE,

  created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp
);

CREATE TABLE session (
  id SERIAL PRIMARY KEY,
  contributor_id INTEGER NOT NULL REFERENCES contributor(id) ON DELETE CASCADE,
  token TEXT NOT NULL,

  created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp
);
