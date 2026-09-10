import {
  DocumentTitle,
  K8sResourceCommon,
  ListPageHeader,
  k8sCreate,
  k8sDelete,
  k8sUpdate,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import {
  ActionGroup,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  PageSection,
  Spinner,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  TextInput,
} from '@patternfly/react-core';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';

import {
  ConsoleNotificationKind,
  ConsoleNotificationModel,
  DEFAULT_BANNER_BG,
  DEFAULT_BANNER_FG,
  OCT_BANNER_NAME,
  getK8sErrorMessage,
  isForbiddenError,
  isTopBanner,
} from '../utils/k8s-resources';
import dashboardLogger from '../utils/logger';
import CommunityDisclaimer from './CommunityDisclaimer';
import ConsoleBranding from './ConsoleBranding';
import './banner.css';

const I18N = 'plugin__oct-banner';
const LOG = 'BANNER';

type ColorPreset = { id: string; bg: string; fg: string };

const COLOR_PRESETS: ColorPreset[] = [
  { id: 'Blue', bg: DEFAULT_BANNER_BG, fg: DEFAULT_BANNER_FG },
  { id: 'Red', bg: '#c9190b', fg: '#ffffff' },
  { id: 'Gold', bg: '#f0ab00', fg: '#151515' },
  { id: 'Green', bg: '#3e8635', fg: '#ffffff' },
  { id: 'Dark', bg: '#151515', fg: '#ffffff' },
];

const locationLabel = (loc: string | undefined, t: (k: string) => string): string => {
  if (loc === 'BannerBottom') return t('Bottom');
  if (loc === 'BannerTopBottom') return t('Top and bottom');
  return t('Top');
};

const BannerPreview: FC<{ text: string; color: string; backgroundColor: string; emptyLabel: string }> = ({
  text,
  color,
  backgroundColor,
  emptyLabel,
}) => (
  <div
    className={`bn-preview${text.trim() ? '' : ' bn-preview--empty'}`}
    style={{ color, backgroundColor }}
    role="img"
    aria-label={text.trim() || emptyLabel}
  >
    {text.trim() || emptyLabel}
  </div>
);

const BannerPage: FC = () => {
  const { t } = useTranslation(I18N);

  const [list, loaded, loadError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: ConsoleNotificationModel.apiGroup,
      version: ConsoleNotificationModel.apiVersion,
      kind: ConsoleNotificationModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const banners = useMemo(
    () => ((list || []) as ConsoleNotificationKind[]).filter((n) => n?.metadata?.name),
    [list],
  );
  const topBanners = useMemo(() => banners.filter(isTopBanner), [banners]);

  const [selectedName, setSelectedName] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [text, setText] = useState('');
  const [bg, setBg] = useState(DEFAULT_BANNER_BG);
  const [fg, setFg] = useState(DEFAULT_BANNER_FG);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [status, setStatus] = useState<{ variant: 'success' | 'danger'; msg: string } | null>(null);
  const [hydratedFor, setHydratedFor] = useState('');

  const selected = useMemo(() => {
    if (selectedName) {
      return topBanners.find((n) => n.metadata.name === selectedName) || null;
    }
    return topBanners[0] || null;
  }, [selectedName, topBanners]);

  useEffect(() => {
    if (!loaded) return;
    const current = selectedName
      ? topBanners.find((n) => n.metadata.name === selectedName)
      : topBanners[0];
    const name = current?.metadata.name || '';
    if (name === hydratedFor && name !== '') return;
    if (!current) {
      setText('');
      setBg(DEFAULT_BANNER_BG);
      setFg(DEFAULT_BANNER_FG);
      setHydratedFor('');
      return;
    }
    setSelectedName(current.metadata.name);
    setText(current.spec?.text || '');
    setBg(current.spec?.backgroundColor || DEFAULT_BANNER_BG);
    setFg(current.spec?.color || DEFAULT_BANNER_FG);
    setHydratedFor(current.metadata.name);
  }, [loaded, topBanners, selectedName, hydratedFor]);

  const onSelectBanner = (name: string) => {
    setSelectedName(name);
    setHydratedFor('');
    setStatus(null);
  };

  const save = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    setStatus(null);
    try {
      if (selected) {
        const next: ConsoleNotificationKind = {
          ...selected,
          spec: {
            ...selected.spec,
            text: trimmed,
            color: fg,
            backgroundColor: bg,
            location: selected.spec?.location || 'BannerTop',
          },
        };
        await k8sUpdate({ model: ConsoleNotificationModel, data: next as unknown as K8sResourceCommon });
        dashboardLogger.info(LOG, 'Updated ConsoleNotification', selected.metadata.name);
      } else {
        const created: ConsoleNotificationKind = {
          apiVersion: 'console.openshift.io/v1',
          kind: 'ConsoleNotification',
          metadata: { name: OCT_BANNER_NAME },
          spec: {
            text: trimmed,
            location: 'BannerTop',
            color: fg,
            backgroundColor: bg,
          },
        };
        await k8sCreate({ model: ConsoleNotificationModel, data: created as unknown as K8sResourceCommon });
        dashboardLogger.info(LOG, 'Created ConsoleNotification', OCT_BANNER_NAME);
        setSelectedName(OCT_BANNER_NAME);
        setHydratedFor(OCT_BANNER_NAME);
      }
      setStatus({ variant: 'success', msg: t('Banner saved.') });
    } catch (err) {
      dashboardLogger.error(LOG, 'Save failed', getK8sErrorMessage(err));
      setStatus({ variant: 'danger', msg: `${t('Could not save the banner.')} ${getK8sErrorMessage(err)}` });
    } finally {
      setSaving(false);
    }
  }, [text, fg, bg, selected, t]);

  const remove = useCallback(async () => {
    if (!selected) return;
    setRemoving(true);
    setStatus(null);
    try {
      await k8sDelete({ model: ConsoleNotificationModel, resource: selected });
      dashboardLogger.info(LOG, 'Deleted ConsoleNotification', selected.metadata.name);
      setSelectedName('');
      setHydratedFor('');
      setText('');
      setBg(DEFAULT_BANNER_BG);
      setFg(DEFAULT_BANNER_FG);
      setStatus({ variant: 'success', msg: t('Banner removed.') });
    } catch (err) {
      dashboardLogger.error(LOG, 'Remove failed', getK8sErrorMessage(err));
      setStatus({ variant: 'danger', msg: `${t('Could not remove the banner.')} ${getK8sErrorMessage(err)}` });
    } finally {
      setRemoving(false);
    }
  }, [selected, t]);

  const goManagementHub = () => {
    window.location.href = '/community-tools/management';
  };

  const loadFailed = Boolean(loadError);
  const forbidden = isForbiddenError(loadError);

  return (
    <>
      <DocumentTitle>{t('Banner')}</DocumentTitle>
      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem
            component="a"
            onClick={(e) => {
              e.preventDefault();
              goManagementHub();
            }}
          >
            {t('Management')}
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{t('Banner')}</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>
      <ListPageHeader title={t('Banner')} />
      <PageSection>
        <Stack hasGutter>
          <StackItem>
            <CommunityDisclaimer />
          </StackItem>
          <StackItem>
            <p className="bn-lead">
              {t('Set the text and colors of the OpenShift Console banner at the top of every page. Changes apply cluster-wide.')}
            </p>
          </StackItem>
          {loadFailed ? (
            <StackItem>
              <Alert
                variant="danger"
                isInline
                title={forbidden ? t('You do not have permission to read ConsoleNotification objects.') : t('Could not load console banners.')}
              >
                {getK8sErrorMessage(loadError)}
              </Alert>
            </StackItem>
          ) : null}
          {!loaded && !loadFailed ? (
            <StackItem>
              <Spinner size="lg" aria-label={t('Current banner')} />
            </StackItem>
          ) : null}
          {loaded && !loadFailed ? (
            <StackItem>
              <Tabs activeKey={activeTab} onSelect={(_, key) => setActiveTab(key as number)}>
                <Tab eventKey={0} title={<TabTitleText>{t('Banner')}</TabTitleText>}>
                  <Stack hasGutter className="bn-tab-content">
                    <StackItem>
                <Card>
                  <CardTitle>{t('Current banner')}</CardTitle>
                  <CardBody>
                    {topBanners.length === 0 ? (
                      <p>{t('No console banner is set.')}</p>
                    ) : (
                      <Stack hasGutter>
                        {topBanners.length > 1 ? (
                          <FormGroup label={t('Select banner')} fieldId="bn-select">
                            <FormSelect
                              id="bn-select"
                              value={selected?.metadata.name || ''}
                              onChange={(_e, v) => onSelectBanner(v)}
                              aria-label={t('Select banner')}
                            >
                              {topBanners.map((n) => (
                                <FormSelectOption key={n.metadata.name} value={n.metadata.name} label={n.metadata.name} />
                              ))}
                            </FormSelect>
                            <FormHelperText>
                              <HelperText>
                                <HelperTextItem>{t('More than one top banner exists. Choose which one to edit.')}</HelperTextItem>
                              </HelperText>
                            </FormHelperText>
                          </FormGroup>
                        ) : null}
                        {selected ? (
                          <>
                            <BannerPreview
                              text={selected.spec?.text || ''}
                              color={selected.spec?.color || DEFAULT_BANNER_FG}
                              backgroundColor={selected.spec?.backgroundColor || DEFAULT_BANNER_BG}
                              emptyLabel={t('Enter banner text')}
                            />
                            <DescriptionList isHorizontal isCompact>
                              <DescriptionListGroup>
                                <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
                                <DescriptionListDescription>{selected.metadata.name}</DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>{t('Location')}</DescriptionListTerm>
                                <DescriptionListDescription>
                                  {locationLabel(selected.spec?.location, t)}
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>{t('Text')}</DescriptionListTerm>
                                <DescriptionListDescription>{selected.spec?.text || '—'}</DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>{t('Background')}</DescriptionListTerm>
                                <DescriptionListDescription className="bn-hex">
                                  {selected.spec?.backgroundColor || '—'}
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>{t('Text color')}</DescriptionListTerm>
                                <DescriptionListDescription className="bn-hex">
                                  {selected.spec?.color || '—'}
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            </DescriptionList>
                          </>
                        ) : null}
                      </Stack>
                    )}
                  </CardBody>
                </Card>
              </StackItem>
              <StackItem>
                <Card>
                  <CardTitle>{t('Edit banner')}</CardTitle>
                  <CardBody>
                    <Form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                      }}
                    >
                      <FormGroup label={t('Banner text')} fieldId="bn-text" isRequired>
                        <TextInput
                          id="bn-text"
                          value={text}
                          onChange={(_e, v) => setText(v)}
                          placeholder={t('Enter banner text')}
                          aria-label={t('Banner text')}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>{t('Shown at the top of the OpenShift Console.')}</HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>
                      <FormGroup label={t('Background color')} fieldId="bn-bg">
                        <div className="bn-color-row">
                          <input
                            id="bn-bg"
                            className="bn-color-input"
                            type="color"
                            value={bg}
                            onChange={(e) => setBg(e.target.value)}
                            aria-label={t('Background color')}
                          />
                          <span className="bn-hex">{bg}</span>
                          <div className="bn-presets">
                            {COLOR_PRESETS.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className={`bn-preset${bg.toLowerCase() === p.bg.toLowerCase() ? ' is-selected' : ''}`}
                                style={{ backgroundColor: p.bg }}
                                aria-label={t(p.id)}
                                title={t(p.id)}
                                onClick={() => {
                                  setBg(p.bg);
                                  setFg(p.fg);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </FormGroup>
                      <FormGroup label={t('Text color')} fieldId="bn-fg">
                        <div className="bn-color-row">
                          <input
                            id="bn-fg"
                            className="bn-color-input"
                            type="color"
                            value={fg}
                            onChange={(e) => setFg(e.target.value)}
                            aria-label={t('Text color')}
                          />
                          <span className="bn-hex">{fg}</span>
                        </div>
                      </FormGroup>
                      <FormGroup label={t('Preview')}>
                        <BannerPreview
                          text={text}
                          color={fg}
                          backgroundColor={bg}
                          emptyLabel={t('Enter banner text')}
                        />
                      </FormGroup>
                      {status ? (
                        <Alert variant={status.variant} isInline title={status.msg} />
                      ) : null}
                      <ActionGroup className="bn-actions">
                        <Button
                          variant="primary"
                          type="submit"
                          isDisabled={saving || removing || !text.trim()}
                          isLoading={saving}
                        >
                          {t('Apply')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => void remove()}
                          isDisabled={!selected || saving || removing}
                          isLoading={removing}
                        >
                          {t('Remove banner')}
                        </Button>
                      </ActionGroup>
                    </Form>
                  </CardBody>
                </Card>
              </StackItem>
                  </Stack>
                </Tab>
                <Tab eventKey={1} title={<TabTitleText>{t('Console Branding')}</TabTitleText>}>
                  <div className="bn-tab-content">
                    <ConsoleBranding />
                  </div>
                </Tab>
              </Tabs>
            </StackItem>
          ) : null}
        </Stack>
      </PageSection>
    </>
  );
};

export default BannerPage;
