// Crude user-agent bucketing for the device-split analytic. Deliberately not
// using a full UA parser — the buckets we care about (mobile / tablet / desktop)
// are reliably indicated by a few well-known tokens; bringing in a parsing
// library would be overkill for one chart.

export type DeviceKind = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export function classifyUserAgent(ua: string | null): DeviceKind {
  if (!ua) return 'unknown';
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return 'tablet';
  if (/mobile|iphone|android.*mobile|phone/.test(s)) return 'mobile';
  if (/mozilla|chrome|safari|firefox|edge/.test(s)) return 'desktop';
  return 'unknown';
}
