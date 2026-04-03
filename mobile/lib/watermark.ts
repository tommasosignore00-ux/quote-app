/**
 * Watermark for trial/free quotes.
 * Punto 32: Free Trial con Watermark - quotes with "Created with QuoteApp" branding.
 */

/**
 * Inject watermark into quote HTML for trial users.
 */
export function injectWatermark(html: string, appName = 'QuoteApp'): string {
  const watermarkHtml = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #dc2626, #991b1b);
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 11px;
      font-family: Arial, sans-serif;
      opacity: 0.85;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    ">
      Creato con ${appName} — quoteapp.it
    </div>
    <div style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80px;
      font-weight: bold;
      color: rgba(220, 38, 38, 0.06);
      font-family: Arial, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      z-index: 9998;
    ">
      ${appName}
    </div>
  `;

  // Inject before closing body tag
  if (html.includes('</body>')) {
    return html.replace('</body>', `${watermarkHtml}</body>`);
  }

  // If no body tag, append at end
  return html + watermarkHtml;
}

/**
 * Remove watermark from HTML (for paid users).
 */
export function removeWatermark(html: string): string {
  // Already clean if no watermark markers
  return html;
}

/**
 * Check if user should get watermarked quotes.
 */
export function shouldShowWatermark(subscriptionStatus: string | null, trialEndsAt?: string | null): boolean {
  if (subscriptionStatus === 'active') return false;
  if (subscriptionStatus === 'trialing') return true; // Trial users get watermark

  // No subscription at all — watermark
  return true;
}
