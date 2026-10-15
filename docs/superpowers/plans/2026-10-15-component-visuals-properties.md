# Component visuals properties and catalog implementation plan

Goal: make Web authoring independent of execution capability while improving package visuals, editable R/C properties and discovery of all 37 requested logic codes.

The supplied Pasted text.txt is the execution brief; Audit_Component_Visuals_035403.md is evidence to verify. Work remains in the current worktree, with no commit/push and no solver/FPGA expansion.

- [x] Reproduce the canonical resistor property-key defect through real store/render integration.
- [x] Split continuous lead geometry, materials, package bodies, markings and appearance. Add neutral reflection resources with explicit ownership; preserve anchors and render-on-demand.
- [x] Implement canonical R/C normalization/validation, precise five-band encoding and compact draft/Update/Cancel forms with unit conversion. Preserve mounts/nets/history and instance isolation.
- [x] Emit lean editor descriptors independent of simulation/manufacturer data. Keep existing execution profiles and safety gates intact.
- [x] Verify and generate 37 logic-code definitions with explicit family aliases/provenance and per-pin semantic fixtures. Retain existing HC/LS IDs/revisions.
- [x] Add case-insensitive palette Search, bounded scrolling grid, keyboard/clear/Escape, shared-factory thumbnails; hide Memory/Logic tools/Embedded from normal add menus while preserving legacy parsing.
- [x] Run generator check, relevant Python tests, full web tests/build and independent integration review.
- [ ] Real visual screenshots: previous local-browser access was explicitly denied; do not bypass the restriction. Report visual verification outstanding if access remains unavailable.

Review focus: no shared-default mutations, exact display of nonrepresentable resistor values, no empty-string-to-zero conversion, no saved binding identity changes, no simulation gating of placement, no per-card WebGL contexts or perpetual frame loop.

Final evidence: generator snapshots match (76 editor definitions / 55 physical parts), 411 Python tests and 498 Web tests pass, production build succeeds, and independent integration review findings are fixed with regression coverage. Visual screenshots remain outstanding because browser access was denied. See [the verification report](../../component-visuals-authoring-verification.md) for commands, changed areas, pinout sources and limits.
