# CRUMB Wire Tool — source analysis

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

Implemented against the approved 2026-10-14 design/plan. CircuitGraph remains schema 1.0 and scene remains a projection. All geometry dimensions are editor units, not physical hardware ratings.

## Topology and electrical identity

`contracts/design-models/breadboards.json` is the canonical explicit contact list for frontend and simulator. `scripts/sync_breadboard_topologies.py --check` checks the generated web copy; contracts package-data includes the JSON and the Python loader works from a wheel.

Each contact has stable contactId, localPosition and nodeId. Terminal A–E and F–J form independent five-hole nodes per column. All declared rail rows are continuous across their visual gaps. Counts: 830 contacts/130 nodes; 630/126; the 100 model is a two-row bus strip, 100/2. Independent board instances never connect by docking or geometry.

The catalog supplies a breadboardTopologyRef while retaining empty logical ports and separate unconfirmed physical metadata. Socket instancing and housing holes consume the same contact list. SceneManager.pickEndpoint recognizes intersection.instanceId and maps it directly to the stable contact; ordinary pick keeps module selection. A reusable contact halo supplies hover feedback without per-hole DOM.

`electrical/endpoints.ts` resolves logical ports or strings such as `BB.contact:terminal:A:01`. `electrical/nets.ts` registers intrinsic node representatives lazily, unions explicit jumper/terminal edges, and checks driver/width conflicts even across different holes of one node. Contact IDs and node IDs are never coordinates, GPIO IDs or routing resources.

## Visual route and commands

`metadata.wireVisual` version 1 holds color, FREE/ORTHOGONAL/AUTO, ordered controlPoints, thickness and optional height/layer. A control point is world-anchored or module-local. Materialized routes also retain optional frameModuleId so canonical endpoint reversal cannot change the routing frame; the field is purely visual. `wireVisual.ts` validates known versions and preserves unknown metadata/version with safe fallback. `circuitFile.ts` preserves schema 1.0, file limits and old files.

`circuit.connectEndpoints` commits endpoint pair and visual together; `connectPorts` remains a compatibility wrapper. Logical normalization reverses visual point order in the same operation. `updateWireVisual` can update only visual data for the given pair, not replace endpoints. No-op/failed commands do not enter history. Support-only module deletion converts its local points to last world positions; endpoint-owner deletion removes incident wires.

`wireRouting.ts` solves endpoint anchors, low board leads, snap and Manhattan elbows. The first orthogonal diagonal uses X before Z; later legs preserve preceding-axis preference. Mixed-owner points transform through world into the primary board frame. Same-board routes transform rigidly under Move/Rotate. `wireRouteEditing.ts` materializes solved interior knots only into an edit draft, moves/inserts/removes them, and translates segments with extra transition knots next to pinned endpoints.

`WireGeometry.ts` uses six-sided tube rings with short rounded corners. Straight runs need two rings, rather than sampling a high arch. `WireLayer.ts` retains wire/material identities, caches geometry signatures, updates color without replacing geometry, tracks endpoint and support owners, and coalesces previews before a draw. Selection handles are one InstancedMesh for the selected wire; segment feedback and drawing preview are reusable Three.js resources. Unknown endpoints remain in graph without guessed geometry.

## Interaction and lifecycle

`useWireRouting.ts` owns click-based drawing and captured edits, and `useCircuitEditor.ts` delegates events before module/pan handlers when consumed. Blank drawing clicks add bends; valid endpoint clicks commit; invalid endpoints retain the draft. Backspace/Delete pops a draft bend; Esc/right click cancels. Bend/segment dragging uses pointer capture, ignores foreign pointers, previews outside graph and commits on release once. Revision/selection checks prevent stale releases updating recreated connections. Camera/context/graph/tool changes cancel transient state.

`WireOptions.vue` renders one compact palette/mode/edit panel. It uses eight jumper colors, Add/Remove bend and existing-style controls. Defaults and drawing changes do not commit graph history; selected-wire color/mode edits do. Panel bounds join Gizmo obstacles. Existing logical DOM port buttons use the same drawing controller; Breadboard contacts and wire handles have no DOM buttons.

## Virtual simulation and Physical Lab

`netcircuit_sim/nets.py` consumes the canonical topology and explicit graph connections, lowers one-driver nets to existing DigitalNet fanout and preserves floating X, duplicate/multiple-driver rejection and supported-model limits. Pose, route, color and thickness are ignored electrically. Contacts do not become capture/drive signal aliases.

Physical execution continues through detected topology, resolved observed bindings and advertised station resources. No scanner/profile/safety/FPGA protocol implementation changed. Tests reject editor contact IDs substituted for physical node/resource IDs, confirm hardware orchestration does not apply the editor graph, and retain the physical RPC rejection of ConfigureVirtualCircuit.

## Verification

New tests cover topology/instance lookup, real scene raycasts and occlusion, contact nets, visual history/file round-trip, low/multi-bend/orthogonal routing, snap, Move/Rotate, bend/segment editing, color, cancellation/stale pointers, cache/disposal/300 wires and virtual/physical boundaries. Exact runs and environment limits are in `verification/2026-10-14-crumb-wire-tool.md`. Browser smoke testing was denied by the browser permission policy; no screenshot or visual browser evidence is claimed.
