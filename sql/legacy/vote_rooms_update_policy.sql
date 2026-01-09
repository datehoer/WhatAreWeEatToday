-- 允许创建者更新自己创建的房间（用于解散/修改名称/调整过期时间等）
-- 如果你已经执行过 sql.sql，这个文件可以单独再执行一次来补齐 UPDATE 策略。
--
-- 验证（在 Dashboard 的 Table Editor / SQL Editor 里）：
-- SELECT room_code, created_by, is_active FROM vote_rooms WHERE room_code = 'XXXX';

DROP POLICY IF EXISTS "Allow authenticated update own rooms" ON vote_rooms;
CREATE POLICY "Allow authenticated update own rooms"
ON vote_rooms
FOR UPDATE
TO authenticated
USING (is_allowed_email() AND created_by = auth.uid())
WITH CHECK (is_allowed_email() AND created_by = auth.uid());
