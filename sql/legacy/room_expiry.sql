-- 添加过期时间和状态字段到 vote_rooms 表
ALTER TABLE vote_rooms
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_by UUID;

-- 添加注释
COMMENT ON COLUMN vote_rooms.expires_at IS '房间过期时间，NULL 表示永不过期';
COMMENT ON COLUMN vote_rooms.is_active IS '房间是否活跃，false 表示已解散';
COMMENT ON COLUMN vote_rooms.created_by IS '创建者用户ID';

-- 创建索引：查询活跃房间
CREATE INDEX IF NOT EXISTS idx_vote_rooms_active ON vote_rooms(is_active) WHERE is_active = true;

-- 创建索引：查询过期房间
CREATE INDEX IF NOT EXISTS idx_vote_rooms_expires_at ON vote_rooms(expires_at) WHERE expires_at IS NOT NULL;

-- 函数：检查房间是否有效（未解散且未过期）
CREATE OR REPLACE FUNCTION is_room_valid(room_code_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    room_expires_at TIMESTAMP WITH TIME ZONE;
    room_is_active BOOLEAN;
BEGIN
    SELECT expires_at, is_active
    INTO room_expires_at, room_is_active
    FROM vote_rooms
    WHERE room_code = room_code_param;

    -- 房间不存在
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- 房间已解散
    IF room_is_active = FALSE THEN
        RETURN FALSE;
    END IF;

    -- 房间已过期
    IF room_expires_at IS NOT NULL AND room_expires_at < timezone('utc'::text, now()) THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION is_room_valid(TEXT) TO authenticated;
