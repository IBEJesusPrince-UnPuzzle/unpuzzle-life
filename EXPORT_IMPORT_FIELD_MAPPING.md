# Export/Import Field Mapping Documentation

This document maps database schema fields to Excel template columns and identifies export-only fields.

## Agenda Tasks

### Database Schema (agendaTasks)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- origin ✓
- originId ✓
- title ✓
- startDate ✓
- endDate ✓
- time ✓
- durationMinutes ✓
- isAllDay ✓
- roleId ✓
- responsibilityId ✓
- status ✓
- color ✓
- recurrenceRule ✓
- recurrenceEndDate ✓
- seriesId ✓
- isOverride ✓
- originalDate ✓
- isCancelled ✓
- notes ✓
- createdAt ✓
- updatedAt ✓

### Missing from Template: None
### Export-Only: userId

---

## Project Tasks

### Database Schema (projectTasks)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- projectId ✓
- title ✓
- notes ✓
- status ✓
- recurrenceRule ✓ (legacy - kept for backward compat)
- recurrenceEndDate ✓ (legacy - kept for backward compat)
- startDate ✓
- endDate ✓
- isAllDay ✓
- sortOrder ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Projects

### Database Schema (projects)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- title ✓
- description ✓
- trigger ✓
- startDate ✓
- endDate ✓
- outcomeDone ✓
- status ✓
- priority ✓
- targetDate ✓
- nextAction ✓
- blockers ✓
- risksWatchouts ✓
- notes ✓
- lastTouchedAt ✓
- stalledAt ✓
- archived ✓
- archivedAt ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Responsibilities

### Database Schema (responsibilities)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- name ✓
- cadence ✓
- dayOfWeek ✓
- customCronExpr ✓
- isPreset ✓
- color ✓
- recurrenceRule ✓
- startDate ✓
- recurrenceEndDate ✓
- projectId ✓
- response ✓
- cue ✓
- craving ✓
- reward ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## People (environmentPeople)

### Database Schema (environmentPeople)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- name ✓
- relationship ✓
- state ✓
- unavailableReason ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Places (environmentPlaces)

### Database Schema (environmentPlaces)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- name ✓
- type ✓
- state ✓
- unavailableReason ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Things (environmentThings)

### Database Schema (environmentThings)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- name ✓
- category ✓
- state ✓
- unavailableReason ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Providers (environmentProviders)

### Database Schema (environmentProviders)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- name ✓
- type ✓
- state ✓
- unavailableReason ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Conditions (environmentConditions)

### Database Schema (environmentConditions)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- name ✓
- description ✓
- state ✓
- unavailableReason ✓
- createdAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Task Completions

### Database Schema (taskCompletions)
- id ✓
- userId (EXPORT ONLY - not imported, derived from session)
- seriesId ✓
- originalDate ✓
- agendaTaskId ✓
- status ✓
- rescheduledTo ✓
- completedAt ✓

### Missing from Template: userId (export only)
### Export-Only: userId

---

## Summary

All sheets are missing the `userId` column which is exported but not imported (derived from the authenticated user session). This is intentional for security/tenancy reasons.

**Export-Only Fields (all tables):**
- userId - The owning user ID, always derived from the authenticated session during import

**Note:** The template currently has all other necessary fields. The only missing column is userId which should be exported but not imported.
