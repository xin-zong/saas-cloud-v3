-- Historical timestamps remain unknown rather than inventing a creation date.
ALTER TABLE app_user ADD COLUMN remarks varchar(2000),ADD COLUMN created_at timestamptz,ADD COLUMN updated_at timestamptz;
ALTER TABLE app_role ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
