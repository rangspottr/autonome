-- Migration 011: Entity grounding — fast entity lookup and relationship walk indexes

-- Fast entity name lookups (workspace-scoped, expression indexes)
CREATE INDEX IF NOT EXISTS idx_contacts_name_lower ON contacts(workspace_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_contacts_company_lower ON contacts(workspace_id, LOWER(company));
CREATE INDEX IF NOT EXISTS idx_deals_title_lower ON deals(workspace_id, LOWER(title));
CREATE INDEX IF NOT EXISTS idx_invoices_description_lower ON invoices(workspace_id, LOWER(description));
CREATE INDEX IF NOT EXISTS idx_tasks_title_lower ON tasks(workspace_id, LOWER(title));

-- Fast entity relationship walks (workspace-scoped, replaces un-scoped indexes from 005)
CREATE INDEX IF NOT EXISTS idx_agent_actions_workspace_entity ON agent_actions(workspace_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace_entity ON agent_memory(workspace_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_entity ON workflows(workspace_id, trigger_entity_type, trigger_entity_id);
