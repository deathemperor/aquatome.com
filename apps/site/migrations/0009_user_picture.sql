-- A reader's profile picture (protocols/accounts.openapi.json, POST /api/v1/account/picture): the id of the photo they
-- chose from the app's set (protocols/profile-pictures.json), never an upload. Removed with the account, and in its export.
-- The owner's OK for this production migration: 2026-11-08.
ALTER TABLE users ADD COLUMN picture TEXT;
