# RapidFix — publishing on Google Play

The Android app (`android/`) is a **Trusted Web Activity**: it opens rapidfix.in full-screen, with real
Android notifications and location permission. Website updates reach the app instantly — you only upload a
new app version to change the icon, name or Android settings.

Files (Desktop → `RapidFix-Android`):

| File | Use |
|---|---|
| `RapidFix-1.0.0-playstore.aab` | Upload to Play Console |
| `RapidFix-1.0.0-test-install.apk` | Install on your own phone to test |
| `rapidfix-upload.keystore` + `KEYSTORE-PASSWORD.txt` | Upload key — **back up both** (Google Drive + pen drive). Without them you can't publish updates (Google can reset it, but it takes days). |
| `play-store-listing/` | App icon 512×512, feature graphic 1024×500, 7 phone screenshots |

---

## Part A — before uploading (15 minutes)

### A1. Deploy the new website and API
- rapidfix.in → upload `rapidfix-frontend.zip`, redeploy.
- api.rapidfix.in → upload `rapidfix-backend.zip`, redeploy.
- Check https://rapidfix.in/.well-known/assetlinks.json shows `"package_name":"in.rapidfix.app"`.

### A2. Turn on push notifications (needed for notifications when the app is closed)
1. Firebase console → project **rapid-fix-c47cb** → ⚙ Project settings → **Cloud Messaging** tab →
   *Web configuration* → **Web Push certificates** → *Generate key pair*. Copy the key (starts with `B…`, it is public).
2. Hostinger → **rapidfix.in** app → File manager → `public/config.js` → paste it into `vapidKey: '…'` and save.
   (Or send it to me and I'll rebuild the frontend zip with it.)
3. Firebase → ⚙ Project settings → **Service accounts** → *Generate new private key* → a JSON file downloads.
   Keep it private.
4. Hostinger → **api.rapidfix.in** app → Environment variables → add:
   ```
   PUSH_PROVIDER=fcm
   FIREBASE_CLIENT_EMAIL=<"client_email" from the JSON>
   FIREBASE_PRIVATE_KEY=<"private_key" from the JSON, the whole -----BEGIN … END----- text, \n included>
   ```
   Save → Redeploy.
5. Test: log in on your phone, allow notifications, lock the phone, and book a service from another account —
   the technician gets “New service request”; when they accept, the customer gets “Technician assigned” and the
   technician gets “Job confirmed”.

---

## Part B — Play Console (step by step)

### B1. Create the app
Play Console → **Create app**
- App name: `RapidFix – Home Services & Repairs`
- Default language: English (India) – en-IN
- App or game: **App** · Free or paid: **Free**
- Tick the declarations → **Create app**

### B2. Set up your app (Dashboard → “Set up your app” tasks)

| Task | What to enter |
|---|---|
| **Privacy policy** | `https://rapidfix.in/privacy` |
| **App access** | *All or some functionality is restricted* → Add instructions: “Login with phone number **9363939199**, OTP **(your Firebase test code)**. Technician login: **9505582333**, OTP **(test code)**.” (Use the Firebase test numbers and codes you set up — reviewers can't receive SMS.) |
| **Ads** | No, my app does not contain ads |
| **Content rating** | Start questionnaire → email → Category **Utility, Productivity, Communication or Other** → answer **No** to violence, sexual content, language, drugs, gambling; **Yes** to “users can interact/exchange information” (customer–technician chat) and “shares location” → Submit. (Expected rating: Everyone / 3+) |
| **Target audience** | 18 and over only |
| **News app** | No |
| **Data safety** | See B3 below |
| **Government app** | No |
| **Financial features** | *My app doesn't provide any financial features* |
| **Health** | No health features |
| **App category** | Category **House & Home** · email: your support email · phone `+91 94919 63366` · website `https://rapidfix.in` |
| **Store listing** | See B4 below |

### B3. Data safety answers
- Does your app collect or share user data? **Yes** · Encrypted in transit? **Yes**
- Account creation: **Yes — phone number (OTP)** · Account deletion URL: `https://rapidfix.in/delete-account`
- Data types collected (all: *collected, not shared*, purpose **App functionality** + **Account management**, required):
  - **Personal info**: Name, Email address, Phone number, Address, Other info (date of birth)
  - **Location**: Approximate and Precise location
  - **Financial info**: Purchase history (bookings/payments) — card/UPI data is handled by Razorpay, not collected by you
  - **Messages**: Other in-app messages (chat with technician)
  - **Photos and videos**: Photos, Videos (problem photos, partner documents)
  - **Files and docs**: Files and docs (partner ID documents)
  - **App activity**: Other user-generated content (reviews)
  - **Device or other IDs**: Device or other IDs (notification token)
- Shared with third parties: **No** (service providers such as Firebase and Razorpay don't count as sharing).

### B4. Main store listing
- **App name**: RapidFix – Home Services & Repairs
- **Short description** (80): `Book verified AC, electrician, plumber & cleaning pros near you. Pay after work.`
- **Full description**:
  ```
  RapidFix – Get It Fixed.

  Book trusted, verified home-service professionals near you in minutes:
  • AC service, repair & installation
  • Electricians, plumbers and carpenters
  • Deep cleaning, pest control and painting
  • Appliance repair, RO service and CCTV installation

  Why RapidFix?
  ✔ Verified professionals – every partner is ID-checked and approved
  ✔ Transparent pricing – see the estimate before you book
  ✔ Pay after the job – cash, UPI or online
  ✔ Live updates – know when your technician is assigned, on the way and has arrived
  ✔ Chat with your technician and track them live
  ✔ Easy cancel and reschedule
  ✔ Real local support, every day 8 AM – 9 PM

  Are you a technician? Join RapidFix as a partner, get jobs near you and grow your earnings.
  ```
- **App icon**: `play-store-listing/app-icon-512.png`
- **Feature graphic**: `play-store-listing/feature-graphic-1024x500.png`
- **Phone screenshots**: upload all 7 from `play-store-listing/phone-screenshots/`
- Tablet screenshots: optional (skip).

### B5. Upload and release
1. Left menu → **Test and release → Production** (or first **Internal testing** to check on your phone — recommended).
2. **Create new release** → Play App Signing: **Use Google-generated key** (default) → Continue.
3. Upload `RapidFix-1.0.0-playstore.aab`.
4. Release name `1.0.0` · Release notes: `First release of RapidFix.`
5. **Countries/regions**: India → Save → **Review release** → **Start rollout to Production**.

### B6. Remove the browser bar (important, 2 minutes)
After the upload, Play re-signs your app with Google's key. Android must see that key on the website:
1. Play Console → **Test and release → Setup → App integrity → App signing** → copy **SHA-256 certificate fingerprint**
   of the *App signing key*.
2. Hostinger → **rapidfix.in** app → Environment variables → add `ANDROID_SHA256` = that fingerprint → Save → Redeploy.
3. Open https://rapidfix.in/.well-known/assetlinks.json — you should see two fingerprints.

If you skip this, the app works but shows a thin “rapidfix.in” bar at the top.

### B7. Review
Google usually reviews in 1–7 days. Organization accounts don't need the 14-day closed test that new personal
accounts need. You'll get an email when it's live.

---

## Updating the app later
Website changes: just redeploy the frontend — the app shows them instantly.
Android changes (name, icon, version): in `android/` run
```bash
bubblewrap update
```
then
```bash
bubblewrap build
```
(passwords are in `KEYSTORE-PASSWORD.txt`), bump `appVersionCode` in `android/twa-manifest.json`, and upload the new `.aab`.
