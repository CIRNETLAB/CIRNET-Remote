# Flexible component placement

CircuitGraph **1.2** is additive. The frozen CircuitGraph 1.0/1.1 schemas,
rigid `MountBinding` v1, public API shapes and compatibility fixtures remain
unchanged. `AnySupportedCircuitGraph` selects the legacy graph or the separate
1.2 schema. An old reader rejects 1.2 instead of interpreting flexible contacts
as a rigid footprint.

`FlexibleMountV1` has `kind: "breadboard-flexible"`, `version: 1`, one `boardId`,
the exact design part/package IDs and revisions, a mechanical profile ID and
revision, `geometryRevision: 1`, `bodyPose`, `contacts` and `leads`. The body is
rigid. Its dimensions and lead diameter come from the package; scale is absent.
`bodyPose.position` is the body center in board-local world units, with
`.13 / 2.54` world units per millimetre. `bodyPose.rotation` is degrees in fixed
Euler **YXZ** order, `Ry * Rx * Rz`. A mounted module has no second world
position or rotation.

Each of the two stable package pin IDs appears exactly once in `contacts` and
`leads`. Contact IDs resolve against that one board. A lead stores at most eight
ordered board-local `controlPoints`; the package's body exit and the contact tip
are derived. Geometry revision 1 reconstructs
`body exit → outward straight stub → controls → vertical contact stub → contact`.
The mechanical profile supplies body-frame exits, minimum/maximum lead length,
straight sections, minimum bend radius, clearance and maximum lift. These are
bounded authoring profiles, **not measured electrical limits**. Axial and radial
profiles exist for the declared resistor, diode, Zener, capacitor and LED
packages. Buzzer and three-pin BJT packages retain their separate rigid strategy.

Both implementations validate exact descriptors, board/pin/contact existence,
per-hole occupancy, finite numbers, lead bounds, bend fit, body/board clearance,
full 3D body overlap and lead intersections. Leads cannot penetrate another
component's expanded body envelope; touching the boundary within the geometry
tolerance is allowed. Different holes on one electrical strip are valid.
Electrical bonds come only from explicit connections, declared internals and
pin/contact bindings. Body pose and bends never create a net or short a passive
component. Shared local and whole-graph cases live in
`fixtures/flexible-mounting-parity.json`.

Opening, saving or executing a legacy design does not migrate its mounting.
The old `leadForm`, `leadLengthMm` and `bodyLiftMm` rendering remains available.
The named `migrate_legacy_mount(graph, module_id)` operation makes a validated
copy, upgrades the graph to 1.2 and explicitly rebuilds flexible intent. It
preserves module/circuit IDs, contacts, properties, connections and unknown
metadata. Old lead settings remain stored but become inactive after the explicit
rebuild; the flexible mount is then the geometry authority. Failure leaves the
input untouched. The editor's corresponding graph command is one undoable
transaction, not an import-time conversion.

New generic design descriptors coexist with all old descriptor/type IDs.
`ComponentDesignPropertiesV1` owns numeric SI values, hex color and enum fields.
Only generic descriptors opt into these new fields; opaque old properties keep
their meaning. Capacitor Type changes require the declared bijection between
`A/B` and `PLUS/MINUS`, a package update and complete geometry validation.
The existing bounded LED DC model uses the new generic instance's validated
forward voltage and maximum current. Its color changes appearance, not measured
light. Unsupported diode/transient-capacitor/buzzer/BJT engines stay unsupported.

The opt-in `/api/v2` routes validate/preview 1.2 graphs, list/create/read/save
documents, create experiments and expose their document references. Document
envelopes use version 2.0; immutable revisions, ownership, session fences and CAS
use the existing repository. Existing Run/Stop and experiment result shapes are
unchanged. A legacy read of a 1.2 document returns
`UNSUPPORTED_DOCUMENT_VERSION` instead of emitting an invalid legacy response.
The Web selects new mutation operations before sending and may perform one
versioned GET after this explicit unsupported-version response. Mutations are
never replayed. Legacy assignment reference contracts still accept only 1.0/1.1.
Attaching a 1.2 reference explicitly produces `AssignmentDefinitionV2` with
`schema_version: "2.0"`; existing definitions and reference graphs retain their
versions until that authoring action. `/api/v2/assignment-documents` supplies
create/list/read/save/publication with versioned envelopes, and
`/api/v2/assignments` supplies the same authorized author or redacted published
student views. Old routes reject a versioned definition with
`UNSUPPORTED_DOCUMENT_VERSION` before changing it. Immutable revisions, CAS,
the published pointer, admission reauthorization and answer redaction use the
same authority as legacy assignments. An experiment pins the selected complete
definition and revision at admission; later reference edits do not change it.
