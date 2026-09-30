## AMMCO PR Checklist

- [ ] I confirmed all database work targets Supabase project `yumeijsyiphzdsulsubf` only.
- [ ] No code, migration, SQL, config, script, or CI step references another Supabase project.
- [ ] I did not touch `Premieros/johna-s` or `Premieros/.com`.
- [ ] Any Excel import is idempotent/versioned and cannot double-count a branch/day.
- [ ] RLS/security was not weakened.

If the active Supabase project is not `yumeijsyiphzdsulsubf`, the required action is `STOP_AND_RECONCILE`.
