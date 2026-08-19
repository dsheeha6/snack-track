# Questions for Danny

The build agent writes here when it hits something only you can decide or only you
can do. Answer inline under each one — plain text is fine. The next run picks up
answers, acts on them, and moves the item to ANSWERED.

---

## OPEN

Nothing is fully blocked — both items below are things only you can do, not
decisions that hold anything up.

### Try the app on your phone
Phase 1's real app exists now (`mobile/`) and everything I can verify without a
device checks out: it bundles clean for iOS/Android/web, email sign-in works
end-to-end (I proved it by requesting a real magic link, reading it out of your
Gmail, and following it through to a signed-in session), and row-level security
is locked down. The one thing only you can do is open it on an actual phone.

1. Install **Expo Go** from the App Store if you don't have it.
2. From `mobile/`, run `npx expo start` and scan the QR code with your phone's
   camera (iOS) or the Expo Go app (Android).
3. Sign in with your email, tap the link when it lands in your inbox, confirm
   you land on a "Today" screen showing calories and macro targets (2200 /
   165P / 220C / 70F — the schema defaults, real numbers from your database).

If the magic-link tap doesn't redirect back into the app, it's almost certainly
because Supabase's Auth → URL Configuration → Redirect URLs allowlist doesn't
include the Expo Go redirect for your network. Reply here with what you saw and
I'll adjust the redirect handling or walk you through adding the URL — I can't
change that dashboard setting myself with the tools I have.

**Danny:**

### Apple Developer Program — when?
$99/year. Not needed until there's something to install on your phone, and Expo Go
covers testing before that. Say the word when you want to enroll.

**Danny:**

---

## ANSWERED

### Node.js installed — done 2026-08-19
Node v24.19.0, npm 11.17.0, installed at `C:\Program Files\nodejs`.

Gotcha for automated runs: any process started *before* the install has a stale
PATH and won't see `node`. If `node --version` fails in a session, call the
binaries by absolute path instead — `"C:\Program Files\nodejs\node.exe"` and
`"C:\Program Files\nodejs\npm.cmd"` — or restart the app so it picks up the PATH.

### GitHub connected — done 2026-08-19
Repo: https://github.com/dsheeha6/snack-track (private).
Remote is set over HTTPS, and Git Credential Manager already holds Danny's GitHub
login, so pushes need no prompt and can run unattended. `main` and `build` are
both pushed.

A dedicated SSH key was generated at `~/.ssh/id_ed25519_snacktrack` as a backup
route. It is NOT registered on GitHub and isn't needed while HTTPS works. If
pushes ever start failing on auth, add that key's `.pub` contents at
https://github.com/settings/keys and switch the remote back to
`git@github.com:dsheeha6/snack-track.git`.

### Create a Supabase backend — done 2026-08-19
Project `snack-track` created on the free tier ($0/month), region us-east-1.
Full schema applied with row level security on every table; security advisor clean.
Details in `docs/supabase.md`, DDL in `db/schema.sql`, keys in `.env.local`
(gitignored). Dashboard: https://supabase.com/dashboard/project/grltvenoqmzhgkfasvlb

Apple and Google sign-in still need turning on in the Supabase dashboard, but that
waits on the developer accounts — email sign-in works without them.
