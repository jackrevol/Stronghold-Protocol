// Connection banner (global chrome, mounted once by main.js): reconnecting / closed / rejected-hello states with
// the matching action, "正在同步同盟状态…" while a resumed session waits for its room/match state, and "服务器已更新"
// while a match still runs on a page the server has moved past (ui/buildGuard.js sets ui.buildStale). Outside a
// match the banner sits at the bottom centre; in a match (html.sp-in-match, set by the match screen) it moves under the
// top bar so it never covers the combat view switcher or the shop bar. While it shows, html.sp-conn moves the toasts
// below it (classes instead of CSS :has(), which Firefox ESR / Safari < 15.4 lack).

import { describeError } from './toasts.js';
import { t } from '../i18n.js';
import { useLocale } from './useLocale.js';
import { html, Button, Icon, useTicker } from './components.js';
import { net, CLIENT_ERR_TEXT } from '../net.js';
import { useStore, shallowEqual } from '../store.js';
import { useDocClass } from './device.js';

/** Whether the banner shows for this connection state (mirrors the early returns below). */
export function bannerVisible(conn, entered, restoring, buildStale = false) {
  if (!entered || !conn) return false;
  if (conn.status === 'online') return !!restoring || !!buildStale;
  if (!conn.everOnline && (conn.status === 'connecting' || conn.status === 'handshaking' || conn.status === 'idle')) return false;
  return true;
}

export function ConnectionBanner() {
  useLocale();
  const conn = useStore((s) => s.connection, shallowEqual);
  const entered = useStore((s) => s.session.entered);
  const restoring = useStore((s) => s.ui.restoring);
  const buildStale = useStore((s) => !!s.ui.buildStale);
  useTicker(conn.status === 'reconnecting' ? 500 : 0);
  useDocClass('sp-conn', bannerVisible(conn, entered, restoring, buildStale));
  if (!entered) return null;
  if (conn.status === 'online' && !restoring && !buildStale) return null;
  if (conn.status === 'online' && restoring) {
    return html`<div class="conn-banner" role="status"><${Icon} name="refresh" /><span>${t('connection.sync')}</span></div>`;
  }
  if (conn.status === 'online' && buildStale) {
    // the server has a newer build than this page: the guard reloads by itself once the match is over, the button is
    // for a player who would rather do it now
    return html`<div class="conn-banner" role="alert">
      <${Icon} name="refresh" />
      <span>${t('connection.updated')}</span>
      <${Button} size="sm" variant="secondary" icon="refresh" onClick=${() => location.reload()}>${t('common.refresh')}<//>
    </div>`;
  }
  if (!conn.everOnline && (conn.status === 'connecting' || conn.status === 'handshaking' || conn.status === 'idle')) return null;
  const secs = conn.retryAt ? Math.max(0, Math.ceil((conn.retryAt - Date.now()) / 1000)) : 0;
  const replaced = conn.status === 'closed' && conn.lastError?.code === 'REPLACED';
  const rejected = conn.status === 'connected' && !!conn.lastError; // hello refused (version, server full…)
  const versionMismatch = rejected && conn.lastError.text === CLIENT_ERR_TEXT.VERSION;
  // Short transitional states (a rename re-sends hello on the live socket) only show if they linger.
  const transient = conn.status === 'connecting' || conn.status === 'handshaking' || (conn.status === 'connected' && !rejected);
  const text = conn.status === 'reconnecting'
    ? t('connection.lost')
    : replaced ? t('connection.replaced')
      : conn.status === 'closed' ? t('connection.closed')
        : rejected ? describeError(conn.lastError) : t('connection.connecting');
  const action = conn.status === 'reconnecting' ? { label: t('connection.retryNow'), run: () => net.retryNow() }
    : conn.status === 'closed' ? { label: replaced ? t('connection.continueHere') : t('connection.reconnect'), run: () => net.connect() }
      : versionMismatch ? { label: t('common.refresh'), run: () => location.reload() }
        : rejected ? { label: t('common.retry'), run: () => net.reconnectNow() } : null;
  return html`<div class=${`conn-banner${transient ? ' conn-banner--soft' : ''}`} role="alert">
    <${Icon} name="wifiOff" />
    <span>${text}</span>
    ${conn.status === 'reconnecting' ? html`<span class="conn-banner__sub">${t('connection.attempt', { count: conn.attempt, seconds: secs })}</span>` : null}
    ${action ? html`<${Button} size="sm" variant="secondary" icon="refresh" onClick=${action.run}>${action.label}<//>` : null}
  </div>`;
}
