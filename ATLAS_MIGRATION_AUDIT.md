# Atlas Migration Audit — Phase 1

Audit date: 2026-11-20  
Scope: read-only project inspection and local MongoDB metadata/count query. No database writes or migrations were performed.

## Status

- Project/database audit: PASS for source inspection and live local metadata.
- Local database records: PASS for read-only counts and indexes.
- Atlas configuration/connection: BLOCKED. No valid MONGODB_URI or MONGODB_URL was present in .env.local; no Atlas connectivity was attempted.
- Migration readiness: BLOCKED pending reconciliation of a material source-count discrepancy and Atlas destination audit.
- Credentials: FAIL. .env.example contains a raw Atlas-looking connection URI rather than a placeholder environment assignment. Its value is intentionally omitted here. Treat its database credential as exposed and rotate it in Atlas. .env.example is explicitly exempted from .gitignore, so it may be committed; repository tracking could not be confirmed because this checkout has no Git metadata.

## Current architecture

The inspected checkout is a Next.js 16.0.1 application using React 19, TypeScript 5, API route handlers, Mongoose 8.19.2, and MongoDB Node driver 6.20.0. No FastAPI, Motor, or Python backend files/dependencies were found. The project context supplied in the task (FastAPI + Motor) does not match this checkout.

MongoDB models are Mongoose models under src/models. Most application routes call the shared src/lib/mongoose-connect.ts helper, directly or through src/lib/auth.ts / src/lib/student-exam-access.ts. The helper reads process.env.MONGODB_URI, maintains a module-level connected flag, and calls mongoose.connect once connected; it has no explicit timeout/pool configuration or application shutdown handler in the inspected file.

The observed local source URI is mongodb://127.0.0.1:27017/online-examination-system. It connects without credentials from this environment. This confirms the application-side local URI, but does not establish the MongoDB server's full authorization configuration.

## Database connection locations

- src/lib/mongoose-connect.ts: shared application connection; uses MONGODB_URI.
- scripts/bootstrap/first-admin.mjs: direct Mongoose connection; hardcodes the local URI and refuses other URIs.
- scripts/migrations/ensure-v1-integrity-indexes.mjs: direct Mongoose connection; reads MONGODB_URI, validates target, and can create indexes.
- scripts/migrations/ensure-v1-integrity-indexes.test.mjs: direct connection for disposable index tests.
- scripts/verification/v1-disposable-runtime.mjs: direct connections to a disposable test database.
- seed/index.ts: uses the shared dbConnect() helper.
- src/lib/auth.ts and src/lib/student-exam-access.ts: call the shared helper; they are not separate connection creators.

No MONGODB_URL usage was found. .env.local and .env.example did not contain a valid MONGODB_URI or MONGODB_URL assignment at audit time. .env.example instead contains the credential-bearing raw URI noted above.

## Live local database inventory

Database: online-examination-system  
Connection: local 127.0.0.1:27017; query was read-only.

| Collection | Documents |
|---|---:|
| users | 5 |
| questions | 2 |
| grades | 2 |
| tests | 2 |
| sections | 2 |
| subjects | 1 |
| results | 1 |
| teacherassignments | 3 |
| sessions | 0 |
| termstemplates | 0 |
| **Total** | **18** |

### Live indexes

All collections have the default _id_ index. Additional live indexes:

| Collection | Index | Key | Options |
|---|---|---|---|
| users | email_1 | email: 1 | unique |
| users | username_1 | username: 1 | unique, sparse |
| users | studentId_1 | studentId: 1 | unique, sparse |
| questions | uniq_question_set_per_test | testId: 1 | unique |
| grades | level_1 | level: 1 | unique |
| sections | grade_1_name_1 | grade: 1, name: 1 | unique |
| subjects | normalizedName_1 | normalizedName: 1 | unique |
| results | uniq_active_attempt_per_student_test | student: 1, test: 1 | unique; partial filter testCompleted: false |
| teacherassignments | teacher_1_grade_1_section_1_subject_1 | teacher: 1, grade: 1, section: 1, subject: 1 | unique |
| sessions | token_1 | token: 1 | unique |
| termstemplates | teacher_1 | teacher: 1 | unique |

## Prior audit discrepancy

V1_LOCAL_DATABASE_AUDIT.json, generated 2026-11-18, reports counts of users 41, students 31, grades 2, sections 2, subjects 1, teacher assignments 2, tests 25, questions 25, and results 231. The live local query on 2026-11-20 reports 5 users, 3 teacher assignments, 2 tests, 2 questions, and 1 result (with 18 total documents across all collections). This is a material discrepancy. The old report is not a substitute for current source data. Reconfirm the intended source database and explain the count changes before migration; do not migrate based on the old snapshot.

The prior report also records 30 unenrolled students, 25 legacy-unlinked tests, and 231 completed but unfinalized/unpublished results. Those relationships/data require owner review if that prior snapshot is still relevant. No records were read into this audit report beyond aggregate counts.

## Index and collection discovery

Ten live collections were discovered: users, questions, grades, tests, sections, subjects, results, teacherassignments, sessions, and termstemplates. The model definitions and live indexes align for the indexes represented in the existing models. Preserve the unique, sparse, and partial index options exactly during any future migration. Empty collections (sessions, termstemplates) still have indexes and should be preserved.

## Files likely requiring later configuration work

No files were changed during Phase 1.

- src/lib/mongoose-connect.ts: currently reads MONGODB_URI; Phase 2 request specifies MONGODB_URL.
- .env.example: replace credential-bearing raw URI with placeholder-only environment assignments; currently unsafe.
- .gitignore: .env.example is explicitly unignored; ensure only placeholders are committed.
- scripts/bootstrap/first-admin.mjs: hardcoded local URI and local-only guard.
- scripts/migrations/ensure-v1-integrity-indexes.mjs: production-capable index writes; inspect its safeguards before any Atlas use.
- scripts/verification/v1-disposable-runtime.mjs and its test: intentionally use disposable databases; keep isolated from production.
- seed/index.ts: uses the shared connection helper; inspect before running against Atlas.

## Risks and migration blockers

1. The live local counts differ substantially from the prior audit report.
2. The Atlas destination state, collections, counts, indexes, and conflicts are unknown.
3. Atlas credentials are unavailable through a safe local configuration at audit time.
4. A credential-bearing URI is present in .env.example; rotate the corresponding Atlas database password and remove the secret from the sample file before later phases.
5. No live review of MongoDB server auth settings, Atlas network allowlist, or Atlas user privileges was possible.
6. Destination unique-index conflicts must be checked before any copy or index creation.
7. The app is Mongoose/Next.js, not FastAPI/Motor, so implementation plans must target the inspected codebase.

## Phase 1 conclusion

Phase 1 read-only audit is complete. No database records, collections, or indexes were modified. Do not proceed with migration until the source-count discrepancy is resolved and the Atlas destination has been audited. Phase 2 configuration is also blocked until a rotated Atlas URI is placed in local environment configuration without sharing it in chat or source control.
