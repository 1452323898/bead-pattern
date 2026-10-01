/* Optional visit analytics; image generation does not depend on this script. */
(function () {
  'use strict';
  if (location.hostname !== '1452323898.github.io' ||
      (location.pathname !== '/bead-pattern' && !location.pathname.startsWith('/bead-pattern/'))) return;

  const key = 'bead-pattern.analytics-consent.v1';
  const notice = document.getElementById('analytics-notice');
  const settings = document.getElementById('analytics-settings');
  const status = document.getElementById('analytics-status');
  const accept = document.getElementById('analytics-accept');
  const decline = document.getElementById('analytics-decline');
  if (!notice || !settings || !status || !accept || !decline) return;
  let choice = null, loaded = false;
  try { choice = localStorage.getItem(key); } catch (_) { /* Private browsing may disable storage. */ }
  if (choice !== 'granted' && choice !== 'denied') choice = null;

  function applyChoice() {
    status.textContent = choice === 'granted' ? '当前选择：允许统计' : choice === 'denied' ? '当前选择：不参与统计' : '尚未选择，不会加载访问统计。';
    if (choice === 'granted' && !loaded) {
      loaded = true;
      window._hmt = window._hmt || [];
      // Site owner's Baidu Tongji snippet, loaded only after consent.
      (function () {
        var hm = document.createElement('script');
        hm.src = 'https://hm.baidu.com/hm.js?f1de1424ffb322c7ee93fcb62a5059c2';
        var s = document.getElementsByTagName('script')[0];
        s.parentNode.insertBefore(hm, s);
      })();
    } else if (loaded) {
      window._hmt.push(['_setAutoTracking', choice === 'granted']);
    }
  }
  function choose(value) {
    choice = value;
    try { localStorage.setItem(key, choice); } catch (_) { /* Keep this visit working without storage. */ }
    applyChoice();
    notice.hidden = true;
    settings.focus({ preventScroll: true });
  }
  accept.addEventListener('click', () => choose('granted'));
  decline.addEventListener('click', () => choose('denied'));
  settings.addEventListener('click', () => {
    notice.hidden = false;
    notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
    decline.focus({ preventScroll: true });
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    choice = event.newValue === 'granted' ? 'granted' : event.newValue === 'denied' ? 'denied' : null;
    applyChoice();
    notice.hidden = choice !== null;
  });
  settings.hidden = false;
  notice.hidden = choice !== null;
  applyChoice();
})();
