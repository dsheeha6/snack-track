# Questions for Danny

The build agent writes here when it hits something only you can decide or only you
can do. Answer inline under each one — plain text is fine. The next run picks up
answers, acts on them, and moves the item to ANSWERED.

---

## OPEN — blocking Phase 1

### 1. Install Node.js
Nothing in the Expo app can start without it. Get the LTS installer from
https://nodejs.org, run it, then reply "done" below. I can't install it
unattended — it needs an installer and admin rights.

**Danny:**

### 2. Create the GitHub repo and connect it
The `gh` command isn't installed, and pushing needs your login, so this part is
yours. Two minutes:

1. Go to https://github.com/new
2. Name it `snack-track`, set it to **Private**, and create it **without** a
   README, .gitignore, or licence (the repo already has those)
3. Then run these two commands in PowerShell, with your username swapped in:

```
cd "C:\Users\dshee\Claude Code\snack-track"; git remote add origin https://github.com/YOUR-USERNAME/snack-track.git
```
```
git push -u origin main; git push -u origin build
```

The first push opens a browser window to sign in to GitHub — that's expected, and
it only happens once. After that every daily run pushes automatically.

**Danny:**

### 3. Apple Developer Program — when?
$99/year. Not needed until there's something to install on your phone, and Expo Go
covers testing before that. Say the word when you want to enroll.

**Danny:**

---

## ANSWERED

### Create a Supabase backend — done 2026-08-19
Project `snack-track` created on the free tier ($0/month), region us-east-1.
Full schema applied with row level security on every table; security advisor clean.
Details in `docs/supabase.md`, DDL in `db/schema.sql`, keys in `.env.local`
(gitignored). Dashboard: https://supabase.com/dashboard/project/grltvenoqmzhgkfasvlb

Apple and Google sign-in still need turning on in the Supabase dashboard, but that
waits on the developer accounts — email sign-in works without them.
