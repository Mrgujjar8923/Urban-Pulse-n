# GovAI Phase 2 pre-recovery backup report

- Created: 2026-10-30 15:13:21 UTC
- Database: `govai`
- Backup directory: `/home/priyanshu/Desktop/7th sem projects/main (Copy)/mini/backend/backups/phase2_pre_recovery_20261030T151320Z`
- Method: Full logical database export in BSON-preserving Extended JSON, including collection metadata and index definitions. `mongodump` was unavailable; the exported database contained all five application collections.
- Collection counts: `users` 21; `members` 4; `complaints` 18; `feedbacks` 0; `notifications` 14.
- Affected-collection exports: included in `collections/` as listed in `manifest.ejson`.
- Manifest SHA-256: `1bac845898d48149afbc4b8f03c342c7913a21de7a3e9ef873e79122825732ce`.

## Verification

1. Manifest and all collection-file checksums passed.
2. All collection exports parsed as Extended JSON and document counts matched the manifest.
3. Restored the database into isolated local MongoDB database `govai_restore_verify_1793373388176`.
4. All five restored collection document counts and index counts matched the backup.
5. The temporary local MongoDB container and its scratch database were stopped and removed after verification.
6. The live Atlas database was read only during backup and identity audit; no live records were modified.

**Result: backup verification passed.**
