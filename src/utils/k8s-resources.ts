import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

/** Cluster-scoped OpenShift Console banner / notification. */
export const ConsoleNotificationModel: K8sModel = {
  apiVersion: 'v1',
  apiGroup: 'console.openshift.io',
  kind: 'ConsoleNotification',
  abbr: 'CN',
  label: 'ConsoleNotification',
  labelPlural: 'ConsoleNotifications',
  plural: 'consolenotifications',
  namespaced: false,
};

export type ConsoleNotificationLocation = 'BannerTop' | 'BannerBottom' | 'BannerTopBottom';

export type ConsoleNotificationKind = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    uid?: string;
    resourceVersion?: string;
  };
  spec: {
    text: string;
    location?: ConsoleNotificationLocation;
    color?: string;
    backgroundColor?: string;
    link?: {
      href: string;
      text: string;
    };
  };
};

/** Product identity for a banner we create — not a lab name. */
export const OCT_BANNER_NAME = 'oct-banner';

export const DEFAULT_BANNER_BG = '#0088ce';
export const DEFAULT_BANNER_FG = '#ffffff';

export function getK8sErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const obj = err as {
    message?: string;
    json?: { message?: string };
  };
  return obj.json?.message || obj.message || String(err);
}

export function getK8sErrorCode(err: unknown): number | undefined {
  const obj = err as { json?: { code?: number }; status?: number; code?: number };
  return obj.json?.code ?? obj.status ?? obj.code;
}

export function isForbiddenError(err: unknown): boolean {
  const code = getK8sErrorCode(err);
  if (code === 403) return true;
  const msg = getK8sErrorMessage(err).toLowerCase();
  return msg.includes('forbidden') || msg.includes('cannot list resource');
}

export function isTopBanner(n: ConsoleNotificationKind): boolean {
  const loc = n.spec?.location || 'BannerTop';
  return loc === 'BannerTop' || loc === 'BannerTopBottom';
}
