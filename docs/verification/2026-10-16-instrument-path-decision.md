# W2 decision — approved instrument paths and analog circuit routing

Date: 2026-10-16. Authority: `docs/ARCHITECTURE.md`, Lab-First v3.1.

## Decision

`physical_analog_routing` describes arbitrary analog circuit routing. It does not authorize or disable a separately declared Scope measurement path or Generator output path. A channel count alone does not authorize either path.

The existing Lab 1.0 and hardware RPC v2 contracts can express the required high-level permission without adding channel-count fields or changing historical schema bytes:

1. `instrument_capabilities` declares the implemented channel range and runtime reconfiguration support.
2. The assignment endpoint resolves to an actual observed student node. Compiler routing uses that node, never an unresolved reference node or reconstructed student wiring.
3. The plan identifies the instrument role, endpoint and channel, and allocates exactly one routing resource to that endpoint.
4. The current station profile declares that resource and explicitly permits the same instrument role at the same node. Resource identities must be unique, and one resource cannot be reused by multiple plan routes.

These relationships form an approved instrument path. `validate_instrument_paths()` checks them for hardware instruments regardless of the arbitrary analog-routing flag. `validate_plan_instruments()` also checks requested generator settings, declared limits and existing capture limits. The compiler and native physical adapter use these shared guards.

A resource that permits only a digital source role is not a Generator path. A resource that reaches another node, an unobserved node, an unsupported channel, a missing route or an ambiguous profile is not sufficient. Setting `physical_analog_routing=true` cannot bypass these checks.

## Driver and lifecycle boundaries

The profile is a declaration from the installed driver, not client-authored permission. It must advertise only paths the driver can safely implement. Internal channel-specific switching restrictions, electrical protection and physical implementation remain driver responsibilities; the adapter still validates the prepared plan before acknowledging it. A profile unable to represent or implement a safe instrument path must leave that capability unavailable. No digital MUX is implicitly promoted to analog service.

Native preparation still requires the observed-node scan, fresh SAFE evidence, a matching protected profile, an executable plan, the legal station state and an allowed execution decision. RPC operations recheck the owning experiment while holding the same station lock as the operation. API user ownership, active lease and cancellation synchronization remain authoritative above that boundary.

Before routing, guarded power-up and execution start, the adapter rechecks current instrument authorization, baseline configuration and profile revision. Losing the approved path/profile enters FAULT and requests safe fallback before the requested operation reaches the driver. Live Generator changes require RUNNING, runtime support, the active allocated channel, the current approved path/profile and fresh SAFE evidence. Requested configuration becomes the acknowledged plan configuration only after the driver accepts the operation. Stop remains available independently of instrument-path authorization.

## Compatibility and evidence

No Lab schema, protobuf field/tag, NCAP layout or browser DTO changes are required. The current default physical profile still declares zero Scope/Generator channels. Analog acquisition remains unavailable; no waveform is synthesized as a fallback.

The previous synthetic Generator test profile enabled arbitrary analog routing solely to bypass the old guard. It now keeps that flag false and explicitly declares a permitted Generator resource. Tests cover Scope and Generator preparation, unsupported/default channels, wrong roles/nodes/resources, duplicate routes/resources, profile/path revocation, safety and owner/state checks. Actual loopback gRPC tests exercise compiler → protobuf mapping → physical adapter with a clearly synthetic protected driver, including live acknowledgement and rejection paths. They establish software boundary behavior only; they do not validate physical instruments, routing electronics or electrical safety closure.
