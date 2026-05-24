-- Migration: Add covers_id column to support junction tables for explicit workaround linking
-- PR #53 Phase 3 - Allows linking a workaround support to a specific broken critical support

-- Responsibility support tables
ALTER TABLE responsibility_people ADD COLUMN covers_id INTEGER;
ALTER TABLE responsibility_places ADD COLUMN covers_id INTEGER;
ALTER TABLE responsibility_things ADD COLUMN covers_id INTEGER;
ALTER TABLE responsibility_providers ADD COLUMN covers_id INTEGER;
ALTER TABLE responsibility_conditions ADD COLUMN covers_id INTEGER;

-- Project support tables  
ALTER TABLE project_people ADD COLUMN covers_id INTEGER;
ALTER TABLE project_places ADD COLUMN covers_id INTEGER;
ALTER TABLE project_things ADD COLUMN covers_id INTEGER;
ALTER TABLE project_providers ADD COLUMN covers_id INTEGER;
ALTER TABLE project_conditions ADD COLUMN covers_id INTEGER;

-- Agenda task support tables
ALTER TABLE agenda_task_people ADD COLUMN covers_id INTEGER;
ALTER TABLE agenda_task_places ADD COLUMN covers_id INTEGER;
ALTER TABLE agenda_task_things ADD COLUMN covers_id INTEGER;
ALTER TABLE agenda_task_providers ADD COLUMN covers_id INTEGER;
ALTER TABLE agenda_task_conditions ADD COLUMN covers_id INTEGER;
