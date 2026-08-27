# AGENTS.md — Banner (OCT extension)

This is **OpenShift Community Tools (OCT)**, a **community project**, not an official Red Hat supported product. Do not describe it as official Red Hat software.

This repository is the **Banner** ConsolePlugin. It is **not** the OCT storefront. Catalog hubs live in `oct-storefront`.

## Identifiers

| | Value |
| --- | --- |
| Plugin ID / ConsolePlugin / `package.json` `consolePlugin.name` | **`oct-banner`** |
| Image | `quay.io/<org>/oct-banner:1.0.0-ocp4.22` (`<semver>-ocp<major.minor>`) |
| i18n | `plugin__oct-banner` |
| Route | `/community-tools/management/banner` |

Display name is **Banner**. No PVC or discovery sidecar.

## What this plugin owns

- Read and update cluster-scoped `ConsoleNotification` objects (`console.openshift.io/v1`)
- Show the current top banner (text and colors) from the live cluster
- Apply new text / background / text color; create `oct-banner` only when none exists
- Remove the selected notification

Uses the signed-in user’s console credentials (Console SDK). No extra ServiceAccount.

## OpenShift and extension versions

Two axes in the catalog: git tag **`v1.x.x`** (semver) and optional branch **`ocp-X.Y`** when PatternFly or APIs diverge. Image tags **always** `<semver>-ocp<major.minor>` (e.g. `1.0.0-ocp4.22`).

- Git: `main` tracks the newest supported minor (currently **4.22**).
- PatternFly 6 on 4.22; do not mix PF majors on one branch.

## Navigation

This plugin **does not** register the Community Tools section or hubs. Open from the storefront **Management** tile or `/community-tools/management/banner`.

## No environment-specific hardcoding

Never bake in lab banner text, colors, hostnames, StorageClasses, or similar. Load `ConsoleNotification` from the cluster. Optional create name is `oct-banner` (product identity). Default colors `#0088ce` / `#ffffff` are OpenShift Console examples, not a lab name. See `.cursor/rules/oct-no-env-hardcoding.mdc`.

## Catalog tile

Storefront `catalog/community.yaml`: `metadata.name: oct-banner`, `consolePlugin: oct-banner`, `spec.href: /community-tools/management/banner`, `category: management`. **Do not list `versions[]` until the combined public image tag exists.** Copy `catalog-tool.yaml` into the storefront PR after publish.

## Add must go Ready

Follow **oct-storefront** `docs/extension-standard.md`. Confirm the plugin Deployment is Running. This plugin has no PVC.

## PatternFly 6

Import from `@patternfly/react-core` ^6. Do **not** import PatternFly CSS. Prefix new CSS `bn-`. Include `CommunityDisclaimer`.

## Verify

```bash
yarn install
yarn build
```

Do not `oc apply` or push images unless asked.
