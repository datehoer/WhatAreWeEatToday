-- 删除旧函数
DROP FUNCTION IF EXISTS get_my_rooms();

-- 重新创建函数，使用表别名避免歧义
CREATE OR REPLACE FUNCTION get_my_rooms()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rooms_data JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'room_code', vr.room_code,
        'room_name', vr.room_name,
        'created_at', vr.created_at,
        'expires_at', vr.expires_at,
        'is_active', vr.is_active,
        'candidates_count', jsonb_array_length(vr.candidates),
        'votes_count', (
            SELECT COUNT(*)
            FROM vote_records
            WHERE room_code = vr.room_code
        )
    )) INTO rooms_data
    FROM (
        SELECT *
        FROM vote_rooms
        WHERE created_by = auth.uid()
          AND is_active = true
        ORDER BY created_at DESC
    ) vr;

    RETURN COALESCE(rooms_data, '[]'::json);
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION get_my_rooms() TO authenticated;
