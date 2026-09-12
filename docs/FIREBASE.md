# Firebase setup — manual steps

I cannot create a Firebase project for you: it needs your Google account in a
browser. Everything below is a step you run. The code is already written and
waits for these values.

**Time:** about 15 minutes. **Cost:** nothing — this stays on the free Spark plan.

---

## 1. Create the project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it `flockbook` (or anything — the id it generates is what matters).
3. **Turn Google Analytics off.** Nothing here uses it and it adds a consent
   surface you would otherwise have to handle.
4. Wait for provisioning, then **Continue**.

## 2. Turn on Email/Password sign-in

1. Left sidebar: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → enable the first toggle
   (leave "Email link / passwordless" off) → **Save**.

## 3. Create the Firestore database

1. **Build → Firestore Database → Create database**.
2. Choose **Start in production mode**. This denies everything by default,
   which is correct — step 6 uploads the real rules.
3. Region: pick the one closest to the farm and **never change it afterwards**.
   For India choose **`asia-south1` (Mumbai)**.

## 4. Register a web app and copy the config

1. **Project settings** (gear icon, top left) → **General** tab.
2. Scroll to **Your apps** → click the web icon **`</>`**.
3. Nickname `flockbook-web`. **Do not** tick Firebase Hosting — the app deploys
   to Vercel.
4. Copy the `firebaseConfig` values from the snippet it shows.

## 5. Put the config in `.env.local`

Create `.env.local` in the project root — it is already gitignored.

```sh
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=flockbook-xxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=flockbook-xxxx
VITE_FIREBASE_STORAGE_BUCKET=flockbook-xxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123
```

Then `npm run dev`. The login page switches from demo credentials to real sign
in and sign up. **Leave these unset and the app runs exactly as the offline
prototype** — that fallback is deliberate, so a fresh checkout always works.

> **On the API key being public:** it ships inside the JavaScript bundle and is
> meant to. It identifies the project, it does not authorise anything. Your
> security comes entirely from the rules in step 6 — which is why those rules
> matter and the key does not.

## 6. Upload the security rules

`firestore.rules` in this repo is the real access boundary. Until it is
uploaded, production mode denies every read and write and the app will show
permission errors.

```sh
npm install -g firebase-tools
firebase login
firebase use --add          # pick the project, alias it "default"
firebase deploy --only firestore:rules
```

Verify in the console under **Firestore → Rules** that the published rules
match the file.

## 7. Add the same variables to Vercel

1. Vercel dashboard → your project → **Settings → Environment Variables**.
2. Add all six `VITE_FIREBASE_*` values for **Production, Preview and
   Development**.
3. **Redeploy.** Vite reads env vars at build time, so an existing deployment
   will not pick them up until it rebuilds.

## 8. Authorise the Vercel domain

Sign-in is rejected from domains Firebase does not know.

1. **Authentication → Settings → Authorized domains → Add domain**.
2. Add your production domain (`flockbook.vercel.app` or your custom domain).
3. Preview deployments get a new URL every time, so either add them as needed
   or test auth only against the stable domain.

---

## Checking it worked

1. `npm run dev`, sign up with a real email and any password of six or more
   characters.
2. In the console, **Firestore → Data** should now show a `users/{uid}`
   document and a `farms/{farmId}` document.
3. Add a production record. A `records` subcollection appears under that farm.
4. Sign out, sign up as a **second** user, and confirm they get an empty farm
   and cannot see the first user's data. This is the isolation test that
   matters — do not skip it.

---

## If it will not connect

| Symptom                                                | Cause                                         | Fix                                                                                           |
| ------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Login page still shows demo credentials                | Env vars not loaded                           | File must be `.env.local` in the project root, vars must start `VITE_`, restart `npm run dev` |
| `Missing or insufficient permissions`                  | Rules not uploaded, or user not a farm member | Run step 6; check `farms/{id}.members` contains the uid                                       |
| `auth/unauthorized-domain`                             | Domain not authorised                         | Step 8                                                                                        |
| `auth/configuration-not-found`                         | Email/Password provider off                   | Step 2                                                                                        |
| `Failed to get document because the client is offline` | First load with no network                    | Expected — the cache fills on first successful load                                           |
| Works locally, fails on Vercel                         | Env vars missing from the build               | Step 7, then redeploy                                                                         |
| `FirebaseError: app/duplicate-app`                     | Hot reload re-initialising                    | Already handled by the cache in `lib/firebase.ts`; report if seen                             |

Read the browser console before changing anything. Firebase error codes are
specific and the table above keys off them.

---

## Free tier limits

Spark plan, per day: **50,000 reads, 20,000 writes, 20,000 deletes**, 1 GiB
stored, 50,000 monthly auth users. The project stays inside this comfortably
because:

- Writes are diffed — only changed records reach Firestore, not the whole farm.
- Firestore's persistent cache serves repeat reads locally.

One farm with a handful of sheds is a rounding error against those limits.
Spark has no billing attached, so it cannot surprise you with a bill; it stops
serving until the quota resets instead.

---

## Emulator (optional, for rules work)

Phase 2 of [PLAN.md](./PLAN.md) needs this to test rules without touching real
data.

```sh
firebase init emulators     # select Auth + Firestore
firebase emulators:start
```
