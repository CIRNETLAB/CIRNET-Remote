# Signal domains and local simulation

[Tiếng Việt](../../vi/architecture/signal-domains-and-simulation.md) · [Documentation](../index.md)

`contracts/design-models/signal-domains.schema.json` defines `SignalDomain`,
`SignalPortDefinition`, the versioned instance namespace, and typed simulation
request/result/error boundaries. Domains are `DIGITAL`, `ANALOG`, `POWER`,
`GROUND`, `CLOCK`, and `MIXED`. They describe design intent. They grant no
hardware routing, energization, instrument channel, or solver capability.

The component library owns domain declarations: functional ports in
`device-library/editor/components.json`, and physical package pins in
`device-library/parts/physical-parts.json`. The explicit `legacyPorts` map retains
historical executor abstractions such as AND/NOT and INPUT/OUTPUT without adding
them to the editor palette. `python -m contracts.codegen.sync_editor_catalog` validates these
sources and generates the matching Python/browser `signal-port-catalog.json`
projections alongside existing editor/part snapshots. The projection records
selection of models already implemented by the local executor; the executor
still validates and compiles the complete design.

## Saved-document compatibility

CircuitGraph 1.0 and 1.1 keep their existing schemas and representations. Neither
loading, saving, classification nor execution inserts domains into old modules,
retags their graph version, changes IDs, or discards unknown metadata. A module
may explicitly carry this namespace:

```json
{"signal_domains":{"version":"1.0","ports":{"OUT":"CLOCK"}}}
```

For version 1.0 the namespace is closed and validates port IDs and enum values.
Known catalog ports cannot be relabeled or supplemented with invented ports.
Unknown component declarations are preserved as author metadata, but do not
create a model. An absent domain on an unknown imported type remains unknown.
Malformed recognized metadata is rejected at Python and browser contract/file
boundaries. Unknown future namespace versions remain storable, including their
unknown fields, and execution rejects them with
`UNSUPPORTED_SIGNAL_DOMAIN_VERSION`. Adapting a future version requires an
explicit migration or execution adapter.

## Compatibility and selection

Python `contracts.signal_domains` and browser `electrical/signalDomains.ts` use
the same generated catalog and shared conformance fixture. Direct compatibility
requires the same domain, or the explicit CLOCK/DIGITAL pairing. Unknown is
incompatible; MIXED is never a wildcard for other domains. Breadboard contacts
retain the domains of the connected circuit; contact names, coordinates, colors
and mesh proximity create no electrical behavior.

Classification distinguishes DIGITAL, DC_DIGITAL, ANALOG, MIXED, and UNKNOWN.
POWER and GROUND are infrastructure and do not turn a digital IC into an analog
solver request. Unknown types stay UNKNOWN even if annotated DIGITAL. Known
catalog types lacking an implemented model retain their domain classification
and appear in `unsupported_components`.

The existing bounded DC adapter covers only declared `dc-source`,
`hc08-powered`, `resistor-dc`, `led-dc` and `contact-switch` profiles. Its explicit
connection adapter permits the established supply/resistor/LED/HC08 circuits;
it continues to check local source references, polarity, supply envelope,
floating inputs and topology. These existing static educational approximations
are not sampled analog acquisition. DC source terminals cannot be overridden by
digital test vectors. The existing DC preview may show UNSUPPORTED components
and unknown values without claiming to execute their behavior.

## Execution boundary

`cirnet_sim.dispatch.SimulationDispatcher` accepts generated
`SimulationRequest` or additive `SimulationRequestV2` (request schema 2.0,
including Graph 1.2) and returns generated `SimulationResult` or
`SimulationErrorResult`. Digital/DC execution delegates to the existing event
engine. SPICEAdapter and MixedSignalCoordinator accept the same typed request
and return `ANALOG_UNAVAILABLE` / `MIXED_SIGNAL_UNAVAILABLE` without a capture or
fabricated samples. Historical direct untyped adapter calls retain their
RuntimeError compatibility behavior. Unsupported digital models return a typed
rejection. There is no additional public Run or analysis endpoint.

The selected release uses the default `legacy` provider from
`cirnet_sim.backends`. The earlier `netcircuit_sim.backends` import remains
an alias. The legacy provider delegates compile/run and preview to the
Python engine and preview boundary. API settings and virtual stations freeze
`CIRNET_SIMULATION_BACKEND` at construction. The serialized plan carries
backend ID, adapter version, plan format and provider payload so workers
resolve the same identity. Unknown, missing or mismatched providers fail
explicitly.

The Simulator source also supports the opt-in `cpp` digital worker when a
matching executable and digest are configured. See the
[Simulator backend guide](https://github.com/cirnetlab/cirnet-simulator/blob/master/docs/en/architecture/backends.md)
for the provider setup and the [migration status](native-migration-status.md)
for the verified artifact combinations.

The reserved `ngspice` selector reports unavailable with zero execution and
instrument capabilities. The [SPICE proposal](../history/native-migration-ledger.md#future-spice-core-based-on-ngspice)
covers future graph/netlist mapping, model and build provenance, result
contracts and lifecycle checks. Document validation, classification and
storage remain available independently of solver capability.

Earlier design record. [analysis and design](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers/specs/2026-10-27-simulator-backends-design.md).

VirtualHardwareStation admits supported CircuitGraph 1.0/1.1/1.2 through this
provider boundary, then executes through the existing Lab lifecycle, RPC, bounded
process worker and capture persistence. The physical station continues to use
its observed topology, policy, plan and safety authority; editor graphs never
replace that authority. The default legacy capabilities report virtual digital only.
The historical NCAP v1 digital encoding is unchanged.

The scheduling budget `CaptureConfiguration.max_events` may be as high as
1,000,000, independently of the 100,000-sample digital capture limit. It bounds
queued engine events, not retained observations. Small captures may use the
larger scheduling budget. If observed changes exceed the capture limit, the
engine raises `CAPTURE_LIMIT` and returns no partial capture; the existing
Hardware Service maps this execution failure to `UNEXECUTABLE`. No truncation
or expansion of the frozen capture contract is implied.

Tests cover shared Python/browser namespace/classification cases, immutable
legacy metadata, typed unavailable errors, existing simulator regressions, and
actual REST → loopback RPC → worker → NCAP captures for powered/unpowered HC08
and bounded DC LED circuits using schema 1.1.

See the [capture catalog](capture-catalog.md) and
[physical lab safety](physical-lab-safety.md).
