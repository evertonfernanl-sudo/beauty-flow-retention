// Pluggable analytics wrapper.
// Activates each provider only if its env var is set at build time.
// Safe no-op on SSR and when keys are missing.

type EventName =
  | "signup_completed"
  | "trial_started"
  | "first_client_created"
  | "first_appointment_created"
  | "first_return_recovered"
  | "plan_upgraded"
  | "plan_cancelled"
  | "login"
  | "logout"
  | string;

type Props = Record<string, unknown>;

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const CLARITY_ID = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;

let initialized = false;

declare global {
  interface Window {
    posthog?: { capture: (e: string, p?: Props) => void; identify: (id: string, p?: Props) => void; reset: () => void };
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    fbq?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

function injectScript(src: string, async = true) {
  const s = document.createElement("script");
  s.src = src;
  s.async = async;
  document.head.appendChild(s);
  return s;
}

function inlineScript(code: string) {
  const s = document.createElement("script");
  s.textContent = code;
  document.head.appendChild(s);
}

export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Honor consent — defer real init until user accepts.
  const consent = localStorage.getItem("bf_cookie_consent");
  if (consent !== "accepted") return;

  if (GA_ID) {
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    inlineScript(
      `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`,
    );
  }
  if (META_PIXEL_ID) {
    inlineScript(
      `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`,
    );
  }
  if (CLARITY_ID) {
    inlineScript(
      `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");`,
    );
  }
  if (POSTHOG_KEY) {
    // Lightweight loader; full SDK lazy-loaded by snippet.
    inlineScript(
      `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${POSTHOG_KEY}',{api_host:'${POSTHOG_HOST}',capture_pageview:true});`,
    );
  }
}

export function track(event: EventName, props?: Props) {
  if (typeof window === "undefined") return;
  try {
    window.posthog?.capture(event, props);
    window.gtag?.("event", event, props);
    window.fbq?.("trackCustom", event, props);
    window.clarity?.("event", event);
  } catch {
    // never let analytics break the app
  }
}

export function identify(userId: string, props?: Props) {
  if (typeof window === "undefined") return;
  try {
    window.posthog?.identify(userId, props);
    window.gtag?.("set", { user_id: userId });
  } catch {
    /* noop */
  }
}

export function resetAnalytics() {
  if (typeof window === "undefined") return;
  try {
    window.posthog?.reset();
  } catch {
    /* noop */
  }
}
