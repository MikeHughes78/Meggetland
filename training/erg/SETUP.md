# EUBC erg scores — setup

Two files: `erg.html` (the page) and `extract-worker/worker.js` (holds the API key).
No photos are ever stored — the confirmed JSON is the system of record.

## 1. Worker (5 minutes)
1. Create an Anthropic API account at console.anthropic.com, add a few pounds of credit, generate a key.
2. Cloudflare dashboard → Workers & Pages → Create Worker → paste `worker.js` → Deploy.
3. Worker → Settings → Variables and Secrets → add secret `ANTHROPIC_API_KEY`.
4. Copy the worker URL (e.g. `https://eubc-erg-extract.xxxx.workers.dev`).

## 2. Page config (top of erg.html)
- `firebaseConfig` — copy verbatim from the training page (same project, trailerplan-a3a9d).
- `EXTRACT_ENDPOINT` — the worker URL from step 1.
- `SIGN_IN_URL` — the final deployed URL (needed for the email-link round trip).
- Add the deployed domain to Firebase console → Authentication → Settings → Authorized domains (meggetland.com should already be there from the training page).

## 3. Data layout (node `eubc-ergscores-v1`)
```
eubc-ergscores-v1/
  members/{emailKey}   { name, email, status: "pending"|"approved", requestedAt }
  coaches/{emailKey}   true
  scores/{pushId}      { emailKey, name, sessionDate, screenDate, submittedAt,
                         format, work{...}, totalTime, pieces[...], edited, warnings[] }
```
Email keys use the dot-to-comma encoding, same as the training system.
To share approvals with the training page instead of running a second queue,
repoint `MEMBERS_PATH` / `COACHES_PATH` at the training system's nodes.

Seed yourself as coach once in the Firebase console:
`eubc-ergscores-v1/coaches/michael,hughes@ed,ac,uk = true`
(and approve members by setting their `status` to `"approved"`).

## 4. Suggested database rules for this node
```json
"eubc-ergscores-v1": {
  "members": {
    "$k": { ".read": "auth != null",
            ".write": "auth != null && (auth.token.email.replace('.', ',') === $k || root.child('eubc-ergscores-v1/coaches').child(auth.token.email.replace('.', ',')).exists())" }
  },
  "coaches": { ".read": "auth != null", ".write": false },
  "scores": {
    ".read": "auth != null",
    ".indexOn": ["emailKey", "submittedAt"],
    "$id": { ".write": "auth != null && !data.exists() && newData.child('emailKey').val() === auth.token.email.replace('.', ',')" }
  }
}
```
Key properties: scores are write-once (no edits/deletes from the client), and an
athlete can only create a score stamped with their own identity. Note RTDB rules
don't have a global replace — the `replace('.', ',')` above handles a single dot,
which covers ed.ac.uk usernames with no dots in the local part; if squad emails
contain dots before the @, key on `auth.uid` instead (happy to rework this).
The `.indexOn` entry matters — without it the "my scores" query gets slow.

## 5. Power Automate → Dataverse (when ready)
Scheduled flow, e.g. nightly:
1. HTTP GET `https://trailerplan-a3a9d-default-rtdb.europe-west1.firebasedatabase.app/eubc-ergscores-v1/scores.json?orderBy="submittedAt"&startAt=<lastRunMs>`
2. Parse JSON, one Dataverse row per piece (long format, same shape as the CSV export).
3. Store the run's max `submittedAt` for the next incremental pull.
Until then, the coach view's CSV export produces the identical long-format table.

## 6. Costs
Claude API only: ~2,000 tokens per photo on Sonnet ≈ well under 1p per submission.
Cloudflare Workers free tier: 100k requests/day. Firebase free tier: ample.
