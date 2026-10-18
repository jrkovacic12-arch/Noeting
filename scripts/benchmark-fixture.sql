BEGIN;
    WITH RECURSIVE n(i) AS (VALUES(0) UNION ALL SELECT i+1 FROM n WHERE i<2999)
      INSERT INTO entries(id,capture_request_id,kind,original_text,created_at)
      SELECT 'n'||i,'n'||i,'note','Note '||i,'2026-01-01' FROM n;
    WITH RECURSIVE n(i) AS (VALUES(0) UNION ALL SELECT i+1 FROM n WHERE i<999)
      INSERT INTO entries(id,capture_request_id,kind,original_text,created_at)
      SELECT 'p'||i,'p'||i,'task','Parent '||i,'2026-01-01' FROM n;
    INSERT INTO entries(id,capture_request_id,kind,original_text,created_at)
      SELECT 'c'||substr(id,2),'c'||substr(id,2),'task','needle '||substr(id,2),'2026-01-01' FROM entries WHERE kind='task';
    INSERT INTO tasks(id,entry_id,title,status,pinned,created_at)
      SELECT 't'||id,id,original_text,'pending',0,created_at FROM entries WHERE kind='task';
    UPDATE tasks SET parent_task_id='tp'||substr(entry_id,2) WHERE entry_id LIKE 'c%';
    COMMIT;
