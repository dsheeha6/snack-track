# Questions for Danny

The build agent writes here when it hits something only you can decide or only you
can do. Answer inline under each one â€” plain text is fine. The next run picks up
answers, acts on them, and moves the item to ANSWERED.

---

## OPEN â€” blocking Phase 1

### 3. Apple Developer Program â€” when?
$99/year. Not needed until there's something to install on your phone, and Expo Go
covers testing before that. Say the word when you want to enroll.

**Danny:**

---

## ANSWERED

### Create a Supabase backend â€” done 2026-08-19
Project `snack-track` created on the free tier ($0/month), region us-east-1.
Full schema applied with row level security on every table; security advisor clean.
Details in `docs/supabase.md`, DDL in `db/schema.sql`, keys in `.env.local`
(gitignored). Dashboard: https://supabase.com/dashboard/project/grltvenoqmzhgkfasvlb

Apple and Google sign-in still need turning on in the Supabase dashboard, but that
waits on the developer accounts â€” email sign-in works without them.

### GitHub connected — done 2026-08-19
Repo: https://github.com/dsheeha6/snack-track (private).
Remote is set over HTTPS and Git Credential Manager already holds Danny's GitHub
login, so pushes work with no prompt. `main` and `build` are both pushed.

A dedicated SSH key was generated at `~/.ssh/id_ed25519_snacktrack` as a backup
route — it is NOT registered on GitHub and isn't needed while HTTPS works. If
pushes ever start failing on auth, add that key's `.pub` at
https://github.com/settings/keys and switch the remote back to
`git@github.com:dsheeha6/snack-track.git`.

### Node.js installed — done 2026-08-19
Node v24.19.0, npm 11.17.0, installed at `C:\Program Files
odejs`.

Gotcha for automated runs: processes started *before* the install have a stale
PATH and won't see `node`. If `node --version` fails in a session, call the
binaries directly — `"C:\Program Files
odejs
ode.exe"` and
`"C:\Program Files
odejs
pm.cmd"` — or restart the app to pick up the PATH.
