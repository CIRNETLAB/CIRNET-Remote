# Component placement and flexible assemblies

CircuitGraph remains the design source of truth. Contact bindings determine electrical
bonds; body/lead intersections never create nets. Mechanical authoring limits are
versioned design constraints, not measurements or electrical ratings of physical parts.
Lab-First identity resolution, execution capability and Safety Gate remain independent.

## Authoring

Choose Resistor, Capacitor, Diode, Zener Diode or LED to open a property draft before
creating an instance. Click an exact breadboard hole for the descriptor's first pin,
then a second hole on the same board. Only the second valid click creates a module and
one Undo entry. HTML drop chooses the first pin only. Add starts a new independent draft.

While choosing the second pin, a short right click adds a bend, Backspace removes the
last bend and Escape cancels. A right drag of at least four pixels remains Orbit.
Invalid spans/occupied holes retain the draft with a diagnostic; no alternative hole
is silently substituted. The last feasible preview dims when the current target fails.

Select an assembly to reveal gold contact handles and green lift/blue tilt handles.
Contact drag changes only that stable pin's binding. Body edits retain contacts and
saved controls. Release validates the complete candidate before recording one command;
cancel, lost capture, document/principal change roll back the preview and camera lock.
The Move tool and X/Z/rotation gizmo transform the entire assembly instead. With Snap
enabled, translation uses the supporting board pitch; every transformed contact must
still be an exact declared hole. Copy/paste transforms the pose and all lead controls.

Rigid DIP/switch/bench placement is retained. Three-pin BJT and the current rigid buzzer
descriptor do not enter the flexible two-pin solver. Pin conventions belong to the
design descriptor and do not assert the identity or pin order of scanned hardware.

## Persistence and compatibility

Graph 1.0/1.1 and rigid `MountBinding` v1 remain readable with their original schemas.
New assemblies opt into Graph **1.2** and `FlexibleMountV1`:

- `kind: breadboard-flexible`, `version: 1`, `geometryRevision: 1`;
- board, design part, package and mechanical profile IDs/revisions;
- one authoritative board-local body-center pose (Euler **YXZ**, degrees);
- exactly two stable pin/contact bindings and per-pin board-local controls (maximum 8).

No derived world pose, mesh or Three.js object is serialized. Profile dimensions use mm;
graph positions use the existing world scale. The deterministic resolver constructs
body exit → outward straight → controls → vertical insertion stub → contact, then
validates length, bend radius, finite coordinates, board clearance and full 3D body/lead
collisions. The renderer builds continuous circular fillets with fixed lead diameter.
Shared TS/Python fixtures cover valid, invalid and boundary-touch geometry.

The immutable profiles in `contracts/design-models/flexible-mechanics.json` are authored
revisioned limits. Changing them requires a new profile revision/migration, not editing
saved assemblies in place. Legacy `leadForm`, `leadLengthMm` and `bodyLiftMm` still render
old documents. Explicit `convertModuleToFlexible` (and Python `migrate_legacy_mount`)
preserves IDs, properties and contacts; ordinary import never silently converts them.

Flexible assemblies are board-owned. Deleting their board deletes those assemblies and
incident edges in the same undoable command. Existing rigid mounts retain their detach
behavior. A flexible assembly cannot be detached into a shape that lacks its board frame.

API `/api/v2` document/validation/preview/experiment-create operations explicitly support
Graph 1.2. Frozen v1 consumers reject unsupported stored documents with
`422 UNSUPPORTED_DOCUMENT_VERSION`. The Web selects v2 before writes; reads retry v2 only
for that explicit version response. CAS revisions, immutable execution snapshots and
local recovery retain exact flexible data. Existing Run/Stop/result operations are reused.
Assignment definitions opt into version 2.0 when a Graph 1.2 reference is copied. Additive
V2 authoring/student/instructor boundaries preserve publication, RBAC, immutable revision
pinning and grading; legacy definition 1.0 and response schemas remain unchanged.

## Design values and rendering

New generic descriptors coexist with exact legacy IDs. Display names, Add mappings,
subtype enums, unit metadata and color validation originate in the canonical parts
catalog. Capacitor Type changes use an explicit A/B ↔ PLUS/MINUS bijection, including
existing wire endpoints, in one validated command. Unknown stored properties and
advanced ratings survive edits and round trips. Engineering-unit inputs preserve the
actual numeric value rather than rounding it for display.

Supported resistor/LED models consume per-instance values (including LED Vf/Imax).
Nonlinear diode, capacitor transient, BJT and buzzer models remain unavailable. LED
color changes its shell and thumbnail; emission requires a real execution result.

The pure solver/controller, pointer adapter and renderer adapter are separate modules.
Occupancy/body indices are cached by immutable modules-array identity; hover is
coalesced per animation frame. Lead replacements are allocated before mutation and
the old owned geometry is disposed after replacement. Pin targets, labels, wires,
selection previews and thumbnails resolve the same contact tips. Thumbnails continue
using one bounded cache and shared renderer, with geometry/profile/color in cache keys.

See the implementation plan and verification report for commands, observed results and
post-change visual artifacts. Input MP4 contact sheets are reference material only.
