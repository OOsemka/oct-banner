import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Spinner,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import dashboardLogger from '../utils/logger';
import { getK8sErrorMessage } from '../utils/k8s-resources';
import './banner.css';

const I18N = 'plugin__oct-banner';
const LOG = 'BRANDING';

const CONFIGMAP_NS = 'openshift-config';
const LOGO_CONFIGMAP_NAME = 'custom-console-logo';

const CONSOLE_OPERATOR_URL = '/api/kubernetes/apis/operator.openshift.io/v1/consoles/cluster';
const CONFIGMAPS_BASE = `/api/kubernetes/api/v1/namespaces/${CONFIGMAP_NS}/configmaps`;
const LOGO_CM_URL = `${CONFIGMAPS_BASE}/${LOGO_CONFIGMAP_NAME}`;

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.svg';

interface K8sMetadata {
  name?: string;
  namespace?: string;
  resourceVersion?: string;
  uid?: string;
}

interface ConsoleOperatorConfig {
  apiVersion?: string;
  kind?: string;
  metadata?: K8sMetadata;
  spec?: {
    customization?: {
      customLogoFile?: { name: string; key: string };
      customProductName?: string;
    };
  };
}

interface ConfigMapResource {
  apiVersion?: string;
  kind?: string;
  metadata?: K8sMetadata;
  data?: Record<string, string>;
  binaryData?: Record<string, string>;
}

async function k8sFetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const resp = await consoleFetch(url, init);
  if (!resp.ok) {
    let msg = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      if (body?.message) msg = body.message;
    } catch { /* ignore parse errors */ }
    throw new Error(msg);
  }
  if (resp.status === 204) return {} as T;
  return (await resp.json()) as T;
}

type Patch = { op: string; path: string; value?: unknown };

function mimeForKey(key: string): string {
  const k = key.toLowerCase();
  if (k.endsWith('.svg')) return 'image/svg+xml';
  if (k.endsWith('.jpg') || k.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

function extensionForMime(mime: string): string {
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/jpeg') return 'jpg';
  return 'png';
}

const ConsoleBranding: FC = () => {
  const { t } = useTranslation(I18N);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [consoleConfig, setConsoleConfig] = useState<ConsoleOperatorConfig | null>(null);
  const [currentLogoSrc, setCurrentLogoSrc] = useState<string | null>(null);
  const [currentProductName, setCurrentProductName] = useState('');

  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedBase64, setUploadedBase64] = useState('');
  const [uploadedMime, setUploadedMime] = useState('');
  const [normalizedInfo, setNormalizedInfo] = useState<string | null>(null);

  const [productNameInput, setProductNameInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<{ variant: 'success' | 'danger' | 'info'; msg: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* ── load Console operator CR and current logo ── */
  const loadConsoleConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const config = await k8sFetchJSON<ConsoleOperatorConfig>(CONSOLE_OPERATOR_URL);
      setConsoleConfig(config);

      const customization = config.spec?.customization;
      const productName = customization?.customProductName || '';
      setCurrentProductName(productName);
      setProductNameInput(productName);

      const logoFile = customization?.customLogoFile;
      if (logoFile?.name && logoFile?.key) {
        try {
          const cm = await k8sFetchJSON<ConfigMapResource>(
            `${CONFIGMAPS_BASE}/${logoFile.name}`,
          );
          const b64 = cm.binaryData?.[logoFile.key];
          if (b64) {
            setCurrentLogoSrc(`data:${mimeForKey(logoFile.key)};base64,${b64}`);
          } else {
            setCurrentLogoSrc(null);
          }
        } catch (cmErr) {
          dashboardLogger.warn(LOG, 'Could not load logo ConfigMap', getK8sErrorMessage(cmErr));
          setCurrentLogoSrc(null);
        }
      } else {
        setCurrentLogoSrc(null);
      }
    } catch (err) {
      dashboardLogger.error(LOG, 'Failed to load Console config', getK8sErrorMessage(err));
      setLoadError(getK8sErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConsoleConfig();
  }, [loadConsoleConfig]);

  /* ── normalize raster images to fit the console header ── */
  const normalizeLogoImage = useCallback(
    (file: File): Promise<{ base64: string; dataUrl: string; info: string }> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const MAX_HEIGHT = 40;
            const MAX_WIDTH = 200;
            let { width, height } = img;
            const origW = width;
            const origH = height;

            if (height > MAX_HEIGHT) {
              width = Math.round(width * (MAX_HEIGHT / height));
              height = MAX_HEIGHT;
            }
            if (width > MAX_WIDTH) {
              height = Math.round(height * (MAX_WIDTH / width));
              width = MAX_WIDTH;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas not supported'));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            const resized = origW !== width || origH !== height;
            const info = resized
              ? `Resized from ${origW}×${origH} to ${width}×${height}px`
              : `${width}×${height}px (no resize needed)`;
            resolve({ base64, dataUrl, info });
          };
          img.onerror = () => reject(new Error('Invalid image'));
          img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    },
    [],
  );

  /* ── file selection ── */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setStatus({ variant: 'danger', msg: t('Invalid file type. Please upload a PNG, JPG, or SVG image.') });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setStatus({ variant: 'danger', msg: t('File is too large. Maximum size is 1 MB.') });
        return;
      }

      setStatus(null);
      setUploadedFileName(file.name);
      setUploadedMime(file.type);

      if (file.type === 'image/svg+xml') {
        // SVGs scale naturally — store as-is
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setUploadedPreview(dataUrl);
          setUploadedBase64(dataUrl.split(',')[1] || '');
          setNormalizedInfo('SVG (vector — no resize needed)');
        };
        reader.readAsDataURL(file);
      } else {
        // Raster images: normalize to fit the console header
        normalizeLogoImage(file)
          .then(({ base64, dataUrl, info }) => {
            setUploadedPreview(dataUrl);
            setUploadedBase64(base64);
            setUploadedMime('image/png'); // canvas always exports PNG
            setNormalizedInfo(info);
          })
          .catch((err) => {
            dashboardLogger.error(LOG, 'Image normalization failed', String(err));
            setStatus({ variant: 'danger', msg: t('Could not process the image. Please try another file.') });
          });
      }
    },
    [t, normalizeLogoImage],
  );

  const clearUpload = useCallback(() => {
    setUploadedPreview(null);
    setUploadedFileName('');
    setUploadedBase64('');
    setUploadedMime('');
    setNormalizedInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  /* ── apply branding ── */
  const applyBranding = useCallback(async () => {
    const hasLogoUpload = !!uploadedBase64;
    const hasProductNameChange = productNameInput !== currentProductName;

    if (!hasLogoUpload && !hasProductNameChange) {
      setStatus({ variant: 'info', msg: t('No changes to apply.') });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const logoKey = hasLogoUpload ? `logo.${extensionForMime(uploadedMime)}` : undefined;

      if (hasLogoUpload && logoKey) {
        const cmData: ConfigMapResource = {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: LOGO_CONFIGMAP_NAME, namespace: CONFIGMAP_NS },
          binaryData: { [logoKey]: uploadedBase64 },
        };

        let existing: ConfigMapResource | null = null;
        try {
          existing = await k8sFetchJSON<ConfigMapResource>(LOGO_CM_URL);
        } catch {
          /* ConfigMap does not exist yet */
        }

        if (existing?.metadata?.resourceVersion) {
          cmData.metadata = {
            ...cmData.metadata,
            resourceVersion: existing.metadata.resourceVersion,
          };
          await k8sFetchJSON(LOGO_CM_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cmData),
          });
          dashboardLogger.info(LOG, 'Updated logo ConfigMap');
        } else {
          await k8sFetchJSON(CONFIGMAPS_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cmData),
          });
          dashboardLogger.info(LOG, 'Created logo ConfigMap');
        }
      }

      const patches: Patch[] = [];
      if (!consoleConfig?.spec?.customization) {
        patches.push({ op: 'add', path: '/spec/customization', value: {} });
      }
      if (hasLogoUpload && logoKey) {
        const existingLogo = consoleConfig?.spec?.customization?.customLogoFile;
        const opLogo = (existingLogo?.name && existingLogo?.key) ? 'replace' : 'add';
        patches.push({
          op: opLogo,
          path: '/spec/customization/customLogoFile',
          value: { name: LOGO_CONFIGMAP_NAME, key: logoKey },
        });
      }
      if (hasProductNameChange) {
        const newName = productNameInput.trim() || null;
        if (newName) {
          const opName = consoleConfig?.spec?.customization?.customProductName ? 'replace' : 'add';
          patches.push({ op: opName, path: '/spec/customization/customProductName', value: newName });
        } else if (consoleConfig?.spec?.customization?.customProductName) {
          patches.push({ op: 'remove', path: '/spec/customization/customProductName' });
        }
      }

      if (patches.length > 0) {
        await k8sFetchJSON(CONSOLE_OPERATOR_URL, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json-patch+json' },
          body: JSON.stringify(patches),
        });
        dashboardLogger.info(LOG, 'Patched Console operator CR');
      }

      setStatus({
        variant: 'success',
        msg: t('Console branding updated. Refresh the page to see the changes.'),
      });
      clearUpload();
      await loadConsoleConfig();
    } catch (err) {
      dashboardLogger.error(LOG, 'Apply branding failed', getK8sErrorMessage(err));
      setStatus({
        variant: 'danger',
        msg: `${t('Could not apply branding.')} ${getK8sErrorMessage(err)}`,
      });
    } finally {
      setSaving(false);
    }
  }, [uploadedBase64, uploadedMime, productNameInput, currentProductName, consoleConfig, clearUpload, loadConsoleConfig, t]);

  /* ── reset to default ── */
  const resetToDefault = useCallback(async () => {
    setResetting(true);
    setStatus(null);
    try {
      if (consoleConfig) {
        const patches: Patch[] = [];
        if (consoleConfig.spec?.customization?.customLogoFile) {
          patches.push({ op: 'remove', path: '/spec/customization/customLogoFile' });
        }
        if (consoleConfig.spec?.customization?.customProductName) {
          patches.push({ op: 'remove', path: '/spec/customization/customProductName' });
        }
        if (patches.length > 0) {
          await k8sFetchJSON(CONSOLE_OPERATOR_URL, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json-patch+json' },
            body: JSON.stringify(patches),
          });
          dashboardLogger.info(LOG, 'Reset Console branding to defaults');
        }
      }

      try {
        await consoleFetch(LOGO_CM_URL, { method: 'DELETE' });
        dashboardLogger.info(LOG, 'Deleted logo ConfigMap');
      } catch {
        dashboardLogger.warn(LOG, 'Could not delete logo ConfigMap (may not exist)');
      }

      setStatus({
        variant: 'success',
        msg: t('Console branding reset to defaults. Refresh the page to see the changes.'),
      });
      clearUpload();
      setProductNameInput('');
      await loadConsoleConfig();
    } catch (err) {
      dashboardLogger.error(LOG, 'Reset branding failed', getK8sErrorMessage(err));
      setStatus({
        variant: 'danger',
        msg: `${t('Could not reset branding.')} ${getK8sErrorMessage(err)}`,
      });
    } finally {
      setResetting(false);
    }
  }, [consoleConfig, clearUpload, loadConsoleConfig, t]);

  /* ── derived flags ── */
  const logoRef = consoleConfig?.spec?.customization?.customLogoFile;
  const hasCustomLogo = !!(logoRef?.name && logoRef?.key);
  const hasCustomProductName = !!consoleConfig?.spec?.customization?.customProductName;
  const hasAnyCustomization = hasCustomLogo || hasCustomProductName;
  const applyDisabled = saving || resetting || (!uploadedBase64 && productNameInput === currentProductName);

  /* ── render ── */
  if (loading) {
    return (
      <Card>
        <CardTitle>{t('Console Branding')}</CardTitle>
        <CardBody>
          <Spinner size="lg" aria-label={t('Loading console branding')} />
        </CardBody>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardTitle>{t('Console Branding')}</CardTitle>
        <CardBody>
          <Alert variant="danger" isInline title={t('Could not load Console configuration.')}>
            {loadError}
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>{t('Console Branding')}</CardTitle>
      <CardBody>
        <Stack hasGutter>
          <StackItem>
            <Alert
              variant="info"
              isInline
              isPlain
              title={t(
                'Changes to the console logo and product name require a page refresh to take effect.',
              )}
            />
          </StackItem>

          {/* current logo */}
          <StackItem>
            <FormGroup label={t('Current logo')} fieldId="bn-current-logo">
              {hasCustomLogo && currentLogoSrc ? (
                <div className="bn-logo-preview">
                  <img
                    src={currentLogoSrc}
                    alt={t('Custom console logo')}
                    className="bn-logo-img"
                  />
                  <HelperText>
                    <HelperTextItem>
                      {t('Custom logo from ConfigMap "{{name}}", key "{{key}}"', {
                        name: consoleConfig?.spec?.customization?.customLogoFile?.name,
                        key: consoleConfig?.spec?.customization?.customLogoFile?.key,
                      })}
                    </HelperTextItem>
                  </HelperText>
                </div>
              ) : hasCustomLogo ? (
                <HelperText>
                  <HelperTextItem variant="warning">
                    {t('A custom logo is configured but the image could not be loaded.')}
                  </HelperTextItem>
                </HelperText>
              ) : (
                <HelperText>
                  <HelperTextItem>
                    {t('Using the default Red Hat OpenShift logo.')}
                  </HelperTextItem>
                </HelperText>
              )}
            </FormGroup>
          </StackItem>

          {/* current product name */}
          {hasCustomProductName && (
            <StackItem>
              <FormGroup label={t('Current product name')}>
                <HelperText>
                  <HelperTextItem>
                    {consoleConfig?.spec?.customization?.customProductName}
                  </HelperTextItem>
                </HelperText>
              </FormGroup>
            </StackItem>
          )}

          {/* edit form */}
          <StackItem>
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                void applyBranding();
              }}
            >
              {/* upload logo */}
              <FormGroup label={t('Upload new logo')} fieldId="bn-logo-upload">
                <div className="bn-upload-row">
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    isDisabled={saving || resetting}
                  >
                    {t('Choose file')}
                  </Button>
                  <span className="bn-upload-filename">
                    {uploadedFileName || t('No file chosen')}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={handleFileChange}
                    className="bn-file-hidden"
                    aria-label={t('Upload logo image')}
                  />
                </div>
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {t('PNG, JPG, or SVG. Maximum 1 MB. Images are auto-resized to fit the console header (max 40px tall).')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              {/* preview uploaded */}
              {uploadedPreview && (
                <FormGroup label={t('Preview')}>
                  <div className="bn-logo-preview">
                    <img
                      src={uploadedPreview}
                      alt={t('Uploaded logo preview')}
                      className="bn-logo-img"
                    />
                    <div className="bn-logo-file-info">
                      <span>{uploadedFileName}</span>
                      {normalizedInfo && (
                        <span className="bn-logo-dimensions">{normalizedInfo}</span>
                      )}
                      <Button variant="link" isInline onClick={clearUpload}>
                        {t('Clear')}
                      </Button>
                    </div>
                  </div>
                </FormGroup>
              )}

              {/* product name */}
              <FormGroup label={t('Custom product name')} fieldId="bn-product-name">
                <TextInput
                  id="bn-product-name"
                  value={productNameInput}
                  onChange={(_e, v) => setProductNameInput(v)}
                  placeholder={t('e.g. My OpenShift')}
                  aria-label={t('Custom product name')}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {t(
                        'Changes the product name in the console header. Leave empty to use the default.',
                      )}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              {status && <Alert variant={status.variant} isInline title={status.msg} />}

              <ActionGroup className="bn-actions">
                <Button
                  variant="primary"
                  type="submit"
                  isDisabled={applyDisabled}
                  isLoading={saving}
                >
                  {t('Apply')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void resetToDefault()}
                  isDisabled={!hasAnyCustomization || saving || resetting}
                  isLoading={resetting}
                >
                  {t('Reset to default')}
                </Button>
              </ActionGroup>
            </Form>
          </StackItem>
        </Stack>
      </CardBody>
    </Card>
  );
};

export default ConsoleBranding;
