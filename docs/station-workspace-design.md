# Station workspace visual foundation

Updated 2026-10-18 for develop-toyingzhen following the user’s latest design direction.

## Design sources

- https://preview.tabler.io/ — dashboard information hierarchy, card boundaries, table toolbars and restrained data presentation.
- https://ui.shadcn.com/blocks — inset navigation, quiet surfaces, compact controls and consistent border/radius treatments.

Both public pages were read on 2026-10-18. This is original CSS inspired by those foundations; no vendor dependency, assets, example data or component implementation was copied. QUDEOX evidence remains the source for business navigation, fields and workflows, not appearance.

## Scope and implementation

`ReferenceAssetWorkspace` imports `reference-station/station-workspace-theme.css` after component imports and wraps its contents with `.station-workspace-theme`. Every theme rule is scoped to that wrapper, including device drawers and asset editor dialogs. There are no root, body or unrelated application overrides.

The shared palette uses white surfaces, a light neutral green canvas, dark green-gray text, muted captions, #278460 accents, subtle borders, 7px control radii and 10px card radii. Changes include larger station headings, inset selected tabs, grouped settings navigation, separated table toolbars, quieter row treatments, consistent focus rings, rounded editor dialogs and responsive device drawers. Responsive rules retain horizontal table scrolling and stack settings navigation on small screens. Reduced-motion preferences disable control transitions.

The station device action says “新增设备档案” and opens the actual archive editor for the selected category. Gateway serial-number binding is not presented as an implemented action.

## Verification

TypeScript, 34 focused UI tests and the production build passed. The station information and device list were visually checked in the local browser at desktop width and the viewport override was reset afterward. Real create, edit, associate and archive workflows were exercised only in the isolated database. Screenshots are saved in the ignored local acceptance directory.
