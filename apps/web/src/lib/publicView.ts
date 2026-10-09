/**
 * After "Open now" on the launch screen, a signed-in staff account (the event laptop is usually the
 * Super Admin's) sees the public RapidFix website in that browser tab, instead of being sent to the
 * admin area. Per tab only: admin pages work as usual in other tabs and after closing this one.
 */
const KEY = 'rapidfix.publicView';

export function setPublicView() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked: the site still opens, staff just land on admin */
  }
}

export function isPublicView() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
