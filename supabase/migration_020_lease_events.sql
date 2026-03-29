-- Full Lease Events engine — Leasecake parity
-- Upgrades critical_dates into a full event lifecycle system with
-- assignees, linked clauses, task statuses, and India-specific triggers

-- Extend critical_dates to be the full events table
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'custom' CHECK (event_type IN (
    'lease_expiry', 'renewal_option', 'rent_escalation', 'notice_deadline',
    'lock_in_end', 'insurance_renewal', 'license_renewal', 'registration_deadline',
    'security_deposit_topup', 'gst_rcm', 'tds_filing', 'fit_out_end',
    'rent_commencement', 'cam_reconciliation', 'option_exercise', 'custom'
));

ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low'));

-- Link to clause that triggers this event
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS clause_id uuid REFERENCES agreement_clauses(id) ON DELETE SET NULL;

-- Task management
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS task_status text DEFAULT 'pending'
    CHECK (task_status IN ('pending', 'in_progress', 'completed', 'overdue', 'escalated'));
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS escalated_to uuid REFERENCES auth.users(id);
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS escalation_after_days integer DEFAULT 7;
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);

-- Financial fields for deposit top-up and payment events
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS amount_formula text;

-- Recurrence for periodic events (TDS filing, GST RCM, CAM reconciliation)
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS recurrence_frequency text
    CHECK (recurrence_frequency IN ('monthly', 'quarterly', 'yearly'));
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS next_occurrence date;

-- Audit
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS notification_count integer DEFAULT 0;

-- Index for overdue detection
CREATE INDEX IF NOT EXISTS idx_critical_dates_task_status ON critical_dates(task_status, date_value)
    WHERE task_status IN ('pending', 'in_progress');

-- Assignee event table for multi-assignee support
CREATE TABLE IF NOT EXISTS event_assignees (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid REFERENCES critical_dates(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    role text DEFAULT 'assignee' CHECK (role IN ('assignee', 'reviewer', 'escalation_target')),
    notified boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_assignees_event ON event_assignees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assignees_user ON event_assignees(user_id);
