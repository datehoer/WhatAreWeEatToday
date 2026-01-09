-- 添加房间名称字段
ALTER TABLE vote_rooms
ADD COLUMN IF NOT EXISTS room_name TEXT;

-- 添加注释
COMMENT ON COLUMN vote_rooms.room_name IS '房间名称（可选）';

-- 更新 get_room_details 函数，包含房间名称
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
        'room_name', room_name,
        'candidates', candidates,
        'created_at', created_at,
        'expires_at', expires_at,
        'is_active', is_active,
        'created_by', created_by
    ) INTO room_info
    FROM vote_rooms
    WHERE room_code = room_code_param;

    -- 获取投票记录（带邮箱）
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

-- 获取当前用户创建的活跃房间列表
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
    FROM vote_rooms
    WHERE created_by = auth.uid()
      AND is_active = true
    ORDER BY created_at DESC;

    RETURN COALESCE(rooms_data, '[]'::json);
END;
$$;
