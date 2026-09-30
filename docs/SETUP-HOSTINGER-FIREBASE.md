# Connecting RapidFix to a Hostinger database and Firebase OTP

Two independent changes. Do Part A first, check the app works, then Part B.

- **Part A — Hostinger MySQL:** the API stores everything in a Hostinger database instead of the MySQL on this laptop. No code change, only `DATABASE_URL`.
- **Part B — Firebase phone OTP:** Firebase sends the login SMS (protected by an invisible reCAPTCHA); the API verifies Firebase's signed token and signs the person in. Switched on with `OTP_PROVIDER=firebase`.

Secrets go only into `backend/.env` and `apps/web/.env` (both git-ignored). Never paste them into chat, email or GitHub.

---

## Part A — Hostinger MySQL database

### A1. Create the database (hPanel)
1. Log in to **hpanel.hostinger.com** → **Websites** → your site → **Manage**.
2. Left menu → **Databases** → **Management** (MySQL Databases).
3. Fill in **database name** (e.g. `rapidfix`), **username** (e.g. `rapidfix`) and a strong **password** → **Create**.
   Hostinger adds a prefix, so the real names look like `u123456789_rapidfix`. Note the exact database name, username and password.

### A2. Allow your computer to connect (Remote MySQL)
Hostinger blocks outside connections by default.
1. **Databases** → **Remote MySQL**.
2. In **IP (IPv4 or IPv6)** enter the public IP of the machine running the API (search "what is my IP" on that machine). Use **Any Host** only for a short test — it lets the whole internet try your password.
3. Pick the database from step A1 → **Create**.
4. On the same page note the **MySQL hostname** (looks like `srv1234.hstgr.io` or an IP address).

> Your home IP can change (router restart). If the API suddenly can't connect, update the IP here. On a server/VPS use that server's fixed IP.

### A3. Point RapidFix at it — `backend/.env`
```env
DATABASE_URL=mysql://u123456789_rapidfix:YOUR_PASSWORD@srv1234.hstgr.io:3306/u123456789_rapidfix
# Keep the automated tests on the laptop's MySQL (Hostinger users can't create databases):
TEST_DATABASE_URL=mysql://root:LOCAL_PASSWORD@localhost:3306/fixora_test
```
If the password contains `@ : / ? # % &` or spaces, URL-encode it (e.g. `@` → `%40`, `#` → `%23`), or choose a password with only letters and numbers.

### A4. Create the tables and (optionally) demo data
From the project folder:
```bash
cd backend
npx prisma migrate deploy      # creates all tables — never deletes data
npm run db:seed                # OPTIONAL: demo services, towns, test users and bookings
```
Skip the seed on a database that already has real customers.

### A5. Check
```bash
npm run dev:api        # from the project root
```
Open http://localhost:4000/api/v1/health → `"db": "ok"`. Then run the web app and log in — bookings you create now appear in phpMyAdmin (hPanel → Databases → phpMyAdmin).

**Common errors**
| Message | Fix |
|---|---|
| `Access denied for user` | wrong username/password, or your IP isn't in Remote MySQL |
| `connect ETIMEDOUT` / `ECONNREFUSED` | wrong hostname, or IP not allowed, or port 3306 blocked on your network |
| `Unknown database` | use the full prefixed name `u123456789_…` |

---

## Part B — Firebase phone OTP

### B1. Create the Firebase project
1. Go to **console.firebase.google.com** → **Add project** → name it `RapidFix` → Analytics optional → **Create**.

### B2. Turn on phone sign-in
1. **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Phone** → **Enable** → **Save**.
3. Still under Phone, **Phone numbers for testing** → add e.g. `+91 94919 63366` with code `123456`. Test numbers log in without sending a real SMS (free, great while building).
4. **Settings** tab → **SMS region policy** → allow **India** (deny everything else to block SMS fraud).
5. **Settings** tab → **Authorized domains**: `localhost` is already there. Add your real domain when you have one (e.g. `rapidfix.in`). Phone sign-in only works on these domains — on a phone, use your domain (HTTPS), not the laptop's IP address.

> Real SMS: Firebase may ask you to move to the **Blaze (pay-as-you-go)** plan to send SMS to real numbers; each SMS to India is billed. Test numbers (step 3) need no billing.

### B3. Register the web app and copy its keys
1. Project overview → ⚙ **Project settings** → **General** → **Your apps** → **Web** (`</>`) → nickname `RapidFix Web` → **Register app** (skip Hosting).
2. Copy the values from the `firebaseConfig` it shows into **`apps/web/.env`**:
```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_PROJECT_ID=rapidfix-xxxxx
VITE_FIREBASE_AUTH_DOMAIN=rapidfix-xxxxx.firebaseapp.com
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
```
(These web keys are designed to be public; they identify the project. Still, restrict the API key: Google Cloud Console → APIs & Services → Credentials → the "Browser key" → Website restrictions → your domains.)

### B4. Switch the API to Firebase — `backend/.env`
```env
OTP_PROVIDER=firebase
FIREBASE_PROJECT_ID=rapidfix-xxxxx     # same as VITE_FIREBASE_PROJECT_ID
```
The API needs no Firebase password for this: it verifies Firebase's token with Google's public keys.

### B5. Restart and test
Stop both dev servers and start them again (`.env` files are read at start-up):
```bash
npm run dev:api
npm run dev:web
```
Open **http://localhost:5173/login** → enter the test number → **Continue** → enter the test code `123456`. You land in the app signed in. With a real number you receive an SMS from Firebase.

How it works: the app asks Firebase to send the SMS (an invisible reCAPTCHA stops bots) → you enter the code → Firebase returns a signed ID token → the app sends it to `POST /api/v1/auth/firebase` → the API checks Google's signature, that the token is for *your* project, fresh (under 10 minutes) and a phone sign-in with an Indian number → finds or creates the RapidFix account → normal RapidFix session. Staff can still use email + password.

**Common errors (shown on the login screen)**
| Message | Fix |
|---|---|
| "This website address isn't allowed for phone sign-in yet" | add the domain in Authentication → Settings → Authorized domains |
| "Phone sign-in is not enabled in Firebase yet" | step B2.2 |
| "Phone sign-in isn't set up in this app build" | `VITE_FIREBASE_*` missing in `apps/web/.env` → restart `dev:web` |
| "Phone verification is not set up yet" | `FIREBASE_PROJECT_ID` missing in `backend/.env` → restart `dev:api` |
| "Too many attempts" / "can't send more codes" | Firebase rate limit or quota — wait, or use a test number |

### B6. (Optional) Push notifications with the same project
- **Web push key:** Project settings → **Cloud Messaging** → **Web Push certificates** → **Generate key pair** → `apps/web/.env`: `VITE_FIREBASE_VAPID_KEY=...`
- **Server sending:** Project settings → **Service accounts** → **Generate new private key** (downloads a JSON — keep it secret, never commit it). Put three values from it into `backend/.env`:
```env
PUSH_PROVIDER=fcm
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@rapidfix-xxxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```
Keep the quotes and the `\n` sequences exactly as in the JSON file.

---

## Going live (later)
Hostinger **shared** hosting runs PHP sites; the RapidFix API is Node.js. For production use a Hostinger **VPS** (or their Node.js hosting if your plan includes it) with the provided Docker setup (`docker-compose.yml`, see README → Deployment), your domain with HTTPS, and:
- `NODE_ENV=production`, `OTP_PROVIDER=firebase`, `FIREBASE_PROJECT_ID`, a real `DATA_ENCRYPTION_KEY`
- the domain added to Firebase **Authorized domains** and to `CORS_ORIGINS` / `WEB_APP_URL`
- Remote MySQL allowing the VPS IP (or run MySQL on the VPS itself)
