ALTER TABLE transactions
  ADD COLUMN paid_by_person_id TEXT NULL
  REFERENCES transaction_people(id) ON DELETE SET NULL;
