# Physical lab components implementation plan

Goal: preserve legacy logical circuits while adding canonical physical parts, real leads, validated breadboard mounting and a powered virtual HC08 / resistor / LED path.

Architecture: canonical device-library parts generate web and Python contract snapshots. Separate package geometry, mechanical mounting and electrical nets. Mounted instance pose is derived from a versioned board-relative binding; legacy module types retain their meanings. Physical graphs use schema 1.1; schema 1.0 remains readable without implicit conversion.

The user's Pasted text.txt supplies the execution brief. Work stays in the existing isolated refactor worktree; the user will commit.

- [x] Canonical exact-part pinouts, footprints and explicit simulation support; generator provenance tests.
- [x] Procedural package factories, silver leads, polarity/markings and hidden picking targets; geometry/resource tests.
- [x] Atomic mounting solver, occupancy, board-relative authoritative poses, editor preview and lifecycle; rotated-board and history tests.
- [x] Typed versioned save/open and API validation, explicit mount bonds and parity fixture; no geometric electrical inference.
- [x] Powered HC08 truth table, floating/removed/reversed supply behavior and bounded DC R/LED loop; unsupported models remain explicit.
- [x] Full web tests/build (467 passed), relevant Python tests (326 passed) and final independent review.
- [ ] Real top/oblique/close screenshots: local browser access was rejected by the browser security policy; user permission is required to finish visual verification.

Review focus: reject forged mount contacts/revisions; reject partial/duplicate occupancy; move/delete board without stale bonds; retain wire/zoom/docking behavior; no implicit ground or passive short circuits.

Independent review corrected inactive-source driver eligibility, oblique drag plane consistency and signed-zero contact lookup. Each finding has a regression reproduced before its fix. No confirmed P1/P2 findings remain. Final verification and the outstanding browser screenshot restriction are recorded in [the implementation report](../../physical-components-verification.md).
