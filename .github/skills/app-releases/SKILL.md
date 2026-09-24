---
name: app-releases
description: Prepare or publish public app catalog and release updates by following the authoritative release contract. Use for app entries, release manifests, packages, signing notices, and release handoffs.
---

# App-release preparation and publishing

Read the complete [publishing contract](../../../releases/README.md) before
editing release content. It is the sole authority for metadata, validation,
distribution and signing limits, and the cross-repository pipeline handoff;
this skill is a navigation and execution workflow, not an alternative contract.

1. Confirm that the app's descriptions and final packages are approved for
   public distribution. If approval or package provenance is unclear, stop
   before publishing. Follow the contract's
   [URLs and layout](../../../releases/README.md#urls-and-layout) and
   [localized display text](../../../releases/README.md#localized-display-text)
   sections when preparing catalog and manifest changes.
2. Follow the [pipeline contract](../../../releases/README.md#pipeline-contract)
   for handoff, final package verification, staging, and publishing. For
   remotely hosted packages, also follow
   [large packages](../../../releases/README.md#large-packages-public-github-releases).
   Do not introduce private-repository automation in this public site.
3. Run `npm run validate:apps`; inspect the intended catalog, manifest, and
   package diff for unapproved files or misleading descriptions. If validation
   or approval fails, correct it before proceeding.
4. Complete the contract's public availability and downloaded-package
   verification before announcing a release. Record the verified release
   version and URLs in the handoff, without publishing credentials or private
   build details.
