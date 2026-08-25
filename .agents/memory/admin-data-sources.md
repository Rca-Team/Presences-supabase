---
name: Admin Data Sources
description: Correct DB tables for registered-user listings vs recognition vs attendance stats — and why they differ.
---

# Admin Data Sources

## The split
| Purpose | Table | Why |
|---|---|---|
| Admin student lists, stats, ID cards, reports | `attendance_records` WHERE `status='registered'` | RegistrationService inserts here; metadata (name, employee_id, blood_group, parent info) lives in `device_info.metadata` |
| Face recognition gallery (gate, attendance scan) | `face_descriptors` | DescriptorCacheService, ProgressiveTrainingService, ArcFaceRecognitionService all read from here |
| Today's attendance counts | `attendance_records` WHERE `status IN (present, late, unauthorized)` + `gate_entries` | present/late events; unauthorized = present |

## Why `attendance_records` for admin lists
`RegistrationService.ts` inserts the canonical student record into `attendance_records` with `status='registered'`. Student metadata (name, employee_id, parent contact, etc.) lives in `device_info.metadata`.

## RegistrationService face_descriptors write
`RegistrationService` now also writes to `face_descriptors` so newly registered students are immediately visible to the recognition engine. Critical rules:

- **NEVER use the admin's `effectiveUserId` (auth user) as `face_descriptors.user_id` for a student.** All students registered in one admin session would share the same UUID → `getAllTrainedDescriptors()` groups by `user_id` and would collapse everyone into one identity.
- Instead: look for an existing `face_descriptors` row by `student_id` (employee_id). Reuse its `user_id` if found. If not found, generate a fresh `uuidv4()` per student.
- This gives every student a stable, unique identity in `face_descriptors` independent of who the authenticated admin is.

## "Green Unknown" name-resolution chain
The recognition engine resolves names through:
1. `getAllTrainedDescriptors()` reads `face_descriptors` — now selects `student_name, student_id, metadata` in addition to `label`. Name priority: `student_name || label || metadata.name || 'Unknown'`.
2. `RecognitionService.recognizeFace()` does a 3-tier `attendance_records` lookup after a match: (1) by `user_id`, (2) by `student_id`/`employee_id`, (3) by `student_name`. Falls back to `best.userName` from step 1 if all lookups miss.
3. Result: `employeeData.name || best.userName` — avoids 'Unknown' for any student who has either a registration record or a `student_name` in `face_descriptors`.

## Deduplication rule (admin queries)
When reading `attendance_records.status='registered'`, deduplicate by `employee_id` (from `device_info.metadata.employee_id`), falling back to `user_id` then record `id`. Take most recent row (order by `timestamp DESC`).

## How to apply
- New admin component showing a student list → query `attendance_records.eq('status','registered')`, map `device_info.metadata` for name/employee_id/category.
- Recognition/gate → reads `face_descriptors` automatically via DescriptorCacheService.
- New registration → `RegistrationService.registerFace()` writes both tables; no extra work needed.
