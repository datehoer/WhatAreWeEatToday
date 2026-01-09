-- 获取房间信息和投票者邮箱的函数
-- 使用 SECURITY DEFINER 以便访问 auth.users 表
CREATE OR REPLACE FUNCTION get_room_details(room_code_param TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    room_info JSON;
    votes_data JSON;
BEGIN
    -- 获取房间信息
    SELECT json_build_object(
        'room_code', room_code,
        'candidates', candidates,
        'created_at', created_at,
        'expires_at', expires_at,
        'is_active', is_active,
        'created_by', created_by
    ) INTO room_info
    FROM vote_rooms
    WHERE room_code = room_code_param;

    -- 获取投票记录（带邮箱）
    -- 注意：vote_records.voter_id 是 TEXT 类型，需要转换为 UUID
    SELECT json_agg(json_build_object(
        'voter_id', voter_id,
        'shop_id', shop_id,
        'voter_email', (
            SELECT email FROM auth.users WHERE id = vote_records.voter_id::uuid
        )
    )) INTO votes_data
    FROM vote_records
    WHERE room_code = room_code_param;

    -- 合并返回
    RETURN json_build_object(
        'room', room_info,
        'votes', COALESCE(votes_data, '[]'::json)
    );
END;
$$;

-- 授权给 authenticated 用户
GRANT EXECUTE ON FUNCTION get_room_details(TEXT) TO authenticated;
