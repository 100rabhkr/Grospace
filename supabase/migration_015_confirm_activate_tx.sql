-- Migration 015: Transactional confirm-and-activate function
-- Wraps outlet + agreement + document + obligations + alerts + activity_log
-- inserts into a single atomic transaction. If any step fails, everything rolls back.

CREATE OR REPLACE FUNCTION confirm_and_activate_tx(
  p_outlet jsonb,
  p_agreement jsonb,
  p_document jsonb DEFAULT NULL,
  p_obligations jsonb DEFAULT '[]'::jsonb,
  p_alerts jsonb DEFAULT '[]'::jsonb,
  p_activity jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_outlet_id uuid;
  v_agreement_id uuid;
  v_obl jsonb;
  v_alert jsonb;
  v_obligations_created int := 0;
  v_alerts_created int := 0;
BEGIN
  -- 1. Insert outlet
  INSERT INTO outlets
    SELECT * FROM jsonb_populate_record(NULL::outlets, p_outlet)
  RETURNING id INTO v_outlet_id;

  -- 2. Insert agreement (inject outlet_id)
  INSERT INTO agreements
    SELECT * FROM jsonb_populate_record(NULL::agreements, p_agreement || jsonb_build_object('outlet_id', v_outlet_id))
  RETURNING id INTO v_agreement_id;

  -- 3. Insert document link (optional)
  IF p_document IS NOT NULL AND p_document != 'null'::jsonb THEN
    INSERT INTO documents
      SELECT * FROM jsonb_populate_record(NULL::documents, p_document || jsonb_build_object('outlet_id', v_outlet_id, 'agreement_id', v_agreement_id));
  END IF;

  -- 4. Insert obligations
  FOR v_obl IN SELECT * FROM jsonb_array_elements(p_obligations)
  LOOP
    INSERT INTO obligations
      SELECT * FROM jsonb_populate_record(NULL::obligations, v_obl || jsonb_build_object('outlet_id', v_outlet_id, 'agreement_id', v_agreement_id));
    v_obligations_created := v_obligations_created + 1;
  END LOOP;

  -- 5. Insert alerts
  FOR v_alert IN SELECT * FROM jsonb_array_elements(p_alerts)
  LOOP
    INSERT INTO alerts
      SELECT * FROM jsonb_populate_record(NULL::alerts, v_alert || jsonb_build_object('outlet_id', v_outlet_id, 'agreement_id', v_agreement_id));
    v_alerts_created := v_alerts_created + 1;
  END LOOP;

  -- 6. Insert activity log
  IF p_activity IS NOT NULL AND p_activity != 'null'::jsonb THEN
    INSERT INTO activity_log
      SELECT * FROM jsonb_populate_record(NULL::activity_log, p_activity || jsonb_build_object(
        'entity_id', v_agreement_id::text,
        'details', (p_activity->'details') || jsonb_build_object(
          'outlet_id', v_outlet_id,
          'obligations_created', v_obligations_created,
          'alerts_created', v_alerts_created
        )
      ));
  END IF;

  RETURN jsonb_build_object(
    'outlet_id', v_outlet_id,
    'agreement_id', v_agreement_id,
    'obligations_created', v_obligations_created,
    'alerts_created', v_alerts_created
  );
END;
$$;
