-- Outlet contacts table for storing lessor, property manager, legal, maintenance contacts
CREATE TABLE IF NOT EXISTS outlet_contacts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id uuid REFERENCES outlets(id) ON DELETE CASCADE NOT NULL,
    org_id uuid REFERENCES organizations(id) NOT NULL,
    name text NOT NULL,
    designation text,
    phone text,
    email text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outlet_contacts_outlet ON outlet_contacts(outlet_id);
