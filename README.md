# My Family Tree

An interactive family tree with real accounts, live sync, and an approval workflow.

## How it works

- **Hosting:** GitHub Pages — a plain public URL, no login required just to reach the site.
- **Sign-in:** Google Sign-In (Firebase Authentication) — visitors sign in with a Google account they already have.
- **Access control:** only email addresses on the allowlist can view the tree. The tree owner (`markdavid104@gmail.com`) is always an approver; everyone else starts as a viewer until granted access.
- **Data:** Firestore (a free real-time database). All viewers see live updates — no manual refresh or file syncing.
- **Editing:** approvers' edits apply immediately and sync to everyone. Everyone else's edits are submitted as a **pending change** that an approver must approve or reject from the "Pending" tab before it goes live.

## Running locally

```bash
python -m http.server 5962
```
Then open http://localhost:5962. Google Sign-In works against `localhost` automatically (Firebase authorizes it by default).

## First-time setup (already done for this deployment)

1. A Firebase project with **Authentication → Google** enabled and a **Firestore database** created.
2. The Firestore security rules in `firestore.rules` pasted into the Firebase Console's Rules tab.
3. The GitHub Pages domain added to Firebase's **Authorized domains** list (Authentication → Settings).
4. `family-data.json` (the starter data — not committed to this public repo, since it holds real personal
   information) sits only on the admin's own machine. Running the app **locally** once and signing in as
   the admin offers a one-time "Import starter data" action that copies it into Firestore. After that,
   the live site never needs the file again — everything comes from Firestore.

## Managing access

Sign in as an approver, open the ⚙ menu → **Manage access**, and add the email addresses of family members you want to let view (and optionally approve changes for) the tree.

## Views

- **Explorer** — click through parents, siblings, spouse(s), children one relationship at a time.
- **Full Tree** — a branching diagram with connector lines, pan, zoom, and collapsible nodes.
- **Browse All** — a searchable, sortable table of everyone.
- **Map** — pins for birthplace/current residence, geocoded from a built-in place lookup table (`PLACE_COORDS` in `app.js` — add new towns there as they come up).
- **Pending** (approvers only) — review and approve/reject changes submitted by other viewers.
