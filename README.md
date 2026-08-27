# Banner (OpenShift Community Tools)

**Community project. Not officially supported by Red Hat.**

Standalone OpenShift Console plugin that shows the current cluster banner and lets you change its text and colors. It reads and writes `ConsoleNotification` (`console.openshift.io/v1`).

- **Plugin ID:** `oct-banner`
- **Image:** `quay.io/<org>/oct-banner:1.0.0-ocp4.22` (`<semver>-ocp<major.minor>`)
- **Route:** `/community-tools/management/banner`
- **Git branch:** `main` / optional `ocp-4.22` when PF/API differ

This is **not** the Community Tools catalog; hubs live in [oct-storefront](https://github.com/OOsemka/oct-storefront). Open from **Community Tools → Management** after the storefront and this plugin are enabled.

Validated on OpenShift **4.22** (PatternFly 6).

## What it does

The OpenShift Console top bar comes from cluster-scoped `ConsoleNotification` objects. This page:

1. Shows whatever banner is already set (text, colors, resource name).
2. Lets you edit text, background color, and text color, with a live preview.
3. Applies the change with your console user (cluster-admin typically).
4. Creates a notification named `oct-banner` only if none exists. It does **not** hardcode cluster names or lab text.

## Contributing — cluster-portable code

Do **not** hardcode environment-specific values (banner copy, lab hostnames, StorageClasses, networks). Read the live `ConsoleNotification`. Agents: `.cursor/rules/oct-no-env-hardcoding.mdc`.

## Build

```bash
yarn install
yarn build
```

## Catalog

After a **public** combined image tag exists (`:1.0.0-ocp4.22`), open a PR against storefront `catalog/community.yaml` using [`catalog-tool.yaml`](catalog-tool.yaml). Register `catalog/deploy/oct-banner.yaml` in `BUNDLED_DEPLOY`. Never catalog a (version, OpenShift minor) row unless that exact tag is public.

## Deploy

`deploy/install.yaml` is for cluster-admin. Do not `oc apply` unless asked. Prefer storefront **Add** once the catalog tile and image tag exist.
