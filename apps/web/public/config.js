/*
 * RapidFix website settings — edit on the web host, no rebuild needed.
 * Empty values use the ones the site was built with.
 *
 * apiUrl:    where the RapidFix API runs. "/api/v1" = same domain as this website
 *            (one Node.js app). If the API runs elsewhere, e.g. a VPS on
 *            api.rapidfix.in, use "https://api.rapidfix.in/api/v1".
 * socketUrl: live updates server; "" = same as the API's domain when apiUrl is a full URL.
 * firebase:  Firebase console → Project settings → Your apps → Web app (these are public values).
 */
window.RAPIDFIX_CONFIG = {
  apiUrl: '',
  socketUrl: '',
  googleMapsKey: '',
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
    messagingSenderId: '',
    vapidKey: '',
  },
};
