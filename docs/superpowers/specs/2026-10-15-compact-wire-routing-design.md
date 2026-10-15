# Compact jumper routing

The binding brief is `C:/Users/trann/.codex/attachments/83cc5372-147c-4950-9cb2-c77c68f32d74/Pasted text.txt`. This is a frontend wire-only change. Electrical endpoints, graph/file schema, simulator, contracts, camera, placement and gizmos stay unchanged.

## Routing boundaries

`solveWireRoute` produces the user's semantic route in world space, without any priority-based height. Breadboard base clearance is the rendered radius plus a small deck gap. Explicit user anchor heights remain editable. Legacy `height` and `layer` metadata load without rewriting files; `height` no longer creates floating breadboard terminals, and `layer` is visual order priority.

A separate derived layout produces rendering points, display handles and display segments attributed to their original semantic spans. Lane offsets and bridge samples never become saved anchors. Picking follows the displayed route; editing maps the hit back to the original route before saving. Pinned electrical endpoints remain exact.

## Terminals

The contact collar uses the board deck and a small diameter-relative terminal clearance, capped by the existing short conductor exposure. It is independent of order priority and all derived lifts. The insulation continues down the vertical lead to that collar. The narrower capped conductor has a fixed deep insertion and a separate hidden overlap. Silver material uses metalness .95, roughness .2, and no emissive light.

## Bundles

Group long overlapping, near-parallel editable spans by their XZ corridor and compatible base heights. Sort unique wires by priority, then creation order. Place their centerlines around the corridor center using adjacent radii plus a 5% diameter gap. Use a shared corridor direction and smooth, bounded lateral fan transitions. Bundle geometry stays at base Y. A shared socket necessarily shares the pin/initial fan region; independent conductors cannot be physically separated inside one socket.

## Crossings

After lateral layout, process wires in priority order. Actual intersections with lower wires create short local bridges. A bridge clears the lower rendered centerline by both radii plus a tiny crossing clearance. Its flat crossing region and smooth monotonic ramps remain bounded to the affected route interval; after the interval the wire returns to its base route. Nearby bridge intervals merge. No unbounded spline, taper or global vertical layer is used. Existing safe full-radius corner handling remains in force for spans too short to support a fillet.

## Cache and UX

Cache input route signatures and pair relationships. On a change, recompute the union of its old/new conflict groups, retaining unrelated layout objects and geometry buffers. Pointer bursts flush only their latest state through the existing scene RAF. Color and selection do not invalidate layout.

Keep Down/Up/Top, but swap priorities rather than heights. Reorder the selected conflict group atomically and preserve unrelated priorities. A no-op creates no history. Selection cycling uses the same stable ordering.

## Acceptance

Terminal exposure/collar/insertion are equal at priorities 0 and 10. Ten to twenty identical straight routes have centered, low, tightly spaced lateral lanes. Crossings lift locally and return to base. Picking and repeated bend/segment edits never persist layout offsets. Priority actions, Undo/Redo, Save/Open and electrical net identity remain correct. Mesh tests cover finite coordinates, constant radius and non-inverted faces; performance tests assert unrelated buffer reuse. Run the full web test command and production build. Browser access remains unavailable after the earlier denial; CPU mesh images must be labeled as such.
