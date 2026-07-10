ALTER TABLE transactions ADD COLUMN date TEXT;
UPDATE transactions SET date = date(created_at, 'unixepoch', 'localtime');
