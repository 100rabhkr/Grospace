-- RPC function for portfolio Q&A - allows AI to run read-only queries
CREATE OR REPLACE FUNCTION exec_readonly_sql(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    -- Safety: only allow SELECT statements
    IF NOT (lower(trim(query_text)) LIKE 'select%') THEN
        RAISE EXCEPTION 'Only SELECT queries are allowed';
    END IF;

    -- Block dangerous keywords
    IF query_text ~* '(drop|delete|update|insert|alter|create|truncate|grant|revoke)' THEN
        RAISE EXCEPTION 'Modification queries are not allowed';
    END IF;

    EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;
    RETURN COALESCE(result, '[]'::json);
END;
$$;
