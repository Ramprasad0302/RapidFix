# RapidFix on the Apple App Store

The iPhone app is `ios-app/`. Like the Android app, it's a native shell around
https://rapidfix.in:
- the website runs full screen in the app's own web view;
- it uses the same `window.RapidFixNative` bridge;
- push notifications come through Firebase (APNs);
- precise location and the technician's background location sharing are native;
- the job-alert tones are the same, and so are the bundled website and service
  snapshot that work offline.

| | |
|---|---|
| Bundle ID | `in.rapidfix.app` |
| Firebase iOS app | `1:346114151442:ios:4f47e6b28eeea1c9bf74cb` (`ios-app/RapidFix/GoogleService-Info.plist`) |
| Project | `ios-app/project.yml` (XcodeGen). `build.sh` generates `RapidFix.xcodeproj`, so don't edit the project in Xcode. |
| Simulator build | `ios-app/build.sh sim` |
| App Store build + upload | `RAPIDFIX_TEAM_ID=XXXXXXXXXX ios-app/build.sh release <build> <version>` |

## Native feel

- **Edge to edge:** the pages pad themselves with `env(safe-area-inset-*)`.
- **120 Hz on ProMotion iPhones:** `CADisableMinimumFrameDurationOnPhone`.
- **Touch behaviour:** no tap flash, no long-press menus on buttons and images, and no zoom when a field is tapped. This comes from the injected `nativeFeel` script.
- **Haptics:** `haptic(kind)` in `apps/web/src/lib/haptics.ts`, used for tab switches and toasts.
- **Launch:** the launch logo fades into the first screen.
- **Job alerts:** the phone vibrates while a job is ringing.

## One-time setup (account owner)

1. **Apple Developer Program**: enrol at https://developer.apple.com/programs/enroll (₹8,700 / $99 a year).
   - Organisation ("Nirmaan Digital") needs a D-U-N-S number and takes about 1–2 weeks.
   - Individual takes about 1–2 days, and the seller name is your own name.
2. **Xcode**: Settings → Accounts → **+** → sign in with that Apple ID.
   The Team ID (10 characters) is shown at developer.apple.com → Membership.
3. **Push (APNs) key**:
   - developer.apple.com → Certificates, IDs & Profiles → Keys → **+** → tick *Apple Push Notifications service* → download the `.p8` file (it can be downloaded once only).
   - Then go to Firebase → Project settings → Cloud Messaging → *Apple app configuration* → upload the `.p8`, its Key ID and the Team ID.
4. **App Store Connect**: My Apps → **+** → New App.
   - Platform iOS, name "RapidFix – Home Services", language English (India), bundle ID `in.rapidfix.app`, SKU `rapidfix-ios`.
5. **Universal links** (optional, so rapidfix.in links open in the app): send the Team ID and
   `/.well-known/apple-app-site-association` is added to the website.

## Store listing

- **Name:** RapidFix – Home Services
- **Subtitle:** AC, plumbing & repairs at home
- **Category:** Lifestyle (secondary: Utilities)
- **Keywords:** ac repair,plumber,electrician,home services,appliance repair,carpenter,cleaning,technician,tanuku
- **Support URL:** https://rapidfix.in/help · **Privacy policy:** https://rapidfix.in/privacy
- **Description:**

  > Book trusted technicians for AC service, plumbing, electrical work, appliance repair and more, right at your doorstep.
  >
  > • Pin your exact door on Google Maps, so the technician reaches you without calls
  > • See the price before you book. Pay a small ₹100 advance online, and the rest after the job
  > • Pay with PhonePe, Google Pay, Paytm, UPI, debit/credit cards or cash
  > • The nearest available technician gets your job first
  > • Track your technician live on the map
  > • Notifications at every step: assigned, on the way, work done
  >
  > Technician partners: go online to receive nearby job requests with a ringing alert, navigate to the customer, and collect payments by QR or payment link.

## App Review information

- **Sign-in:** phone number + OTP. Add a test number in Firebase → Authentication → Sign-in method → Phone →
  *Phone numbers for testing* (e.g. +91 90000 00001 / 123456), and give it in **App Review Information → Sign-in required**.
  Also give a technician test account so the reviewer can see job alerts.
- **Notes for the reviewer:**

  > RapidFix books home-repair technicians. Customers book and pay for services performed in person
  > (Razorpay; physical services, so not In-App Purchase). Background location is used only by technician
  > partners while they are "online for jobs": it sends their position so the nearest job requests reach them and
  > customers see them on the way. Going offline in the app stops it (the blue location indicator shows
  > while it runs). Customers never share location in the background.

## App Privacy (nutrition label)

Data collected, all **linked to the user** and **not used for tracking**:

| Data | Used for |
|---|---|
| Name, phone number, email address | App functionality (account, bookings) |
| Precise location | App functionality (service address; technicians' live location while online) |
| Physical address | App functionality |
| Payment info: *not collected* | Razorpay handles card/UPI details |
| Photos | App functionality (job photos, technician documents) |
| User ID, device ID (push token) | App functionality (notifications) |
| Purchase history | App functionality (bookings, invoices) |

## Limits on iPhone (Apple rules)

- **Job alert while the app is closed:** iOS plays the technician's chosen tone once, up to 29 s, as a
  time-sensitive notification. It can't ring continuously like the Android app. With the app open, it rings until answered.
- **Background location:** needs "Always" location. iOS offers the upgrade the first time a technician goes online.
  If the technician swipes the app away, iOS relaunches it on the next significant move (about 500 m).
