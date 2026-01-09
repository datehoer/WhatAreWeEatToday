-- 修复后的获取房间列表函数
CREATE OR REPLACE FUNCTION get_my_rooms()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rooms_data JSON;
BEGIN
    SELECT json_agg(json_build_object(
        'room_code', room_code,
        'room_name', room_name,
        'created_at', created_at,
        'expires_at', expires_at,
        'is_active', is_active,
        'candidates_count', jsonb_array_length(candidates),
        'votes_count', (
            SELECT COUNT(*) FROM vote_records WHERE room_code = vote_rooms.room_code
        )
    )) INTO rooms_data
    FROM (
        SELECT *
        FROM vote_rooms
        WHERE created_by = auth.uid()
          AND is_active = true
        ORDER BY created_at DESC
    ) AS sorted_rooms;

    RETURN COALESCE(rooms_data, '[]'::json);
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION get_my_rooms() TO authenticated;
