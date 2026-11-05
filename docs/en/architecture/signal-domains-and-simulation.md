# Signal domains and local simulation

[Tiếng Việt](../../vi/architecture/signal-domains-and-simulation.md) · [Full original note](../../architecture/signal-domains-and-simulation.md)

`SignalDomain` describes design intent through `DIGITAL`, `ANALOG`, `POWER`, `GROUND`, `CLOCK` and `MIXED`. Contracts defines the shapes and the component library declares domains for functional ports and physical pins. Python and the browser consume generated catalogs and shared fixtures. Legacy executor ports such as AND/NOT and INPUT/OUTPUT remain recognized without adding components to the editor palette.

## Documents and compatibility

The optional namespace is versioned and stays in the document as authored. Loading, classifying, saving or executing a legacy graph leaves existing IDs, versions and metadata intact.

```json
{"signal_domains":{"version":"1.0","ports":{"OUT":"CLOCK"}}}
```

The 1.0 namespace checks port IDs and domain enums. A known port keeps its catalog declaration. An unknown type stays unknown even if annotated DIGITAL. Future namespace versions remain storable, while execution returns `UNSUPPORTED_SIGNAL_DOMAIN_VERSION`. Direct compatibility requires matching domains or the explicit CLOCK/DIGITAL pairing. Unknown is incompatible and MIXED is no wildcard. Breadboard contacts inherit connected circuit behavior from the graph.

Classification distinguishes DIGITAL, DC_DIGITAL, ANALOG, MIXED and UNKNOWN. POWER and GROUND describe infrastructure. The bounded DC adapter supports the declared `dc-source`, `hc08-powered`, `resistor-dc`, `led-dc` and `contact-switch` profiles. It checks source references, polarity, supply envelope, floating inputs and topology. Digital vectors cannot override DC terminals. Preview can show unknown values and unsupported devices without claiming their behavior was simulated.

## Execution and availability

`cirnet_sim.dispatch.SimulationDispatcher` accepts typed `SimulationRequest` or `SimulationRequestV2` with Graph 1.2 and returns a typed result or error. The default `legacy` provider uses the existing digital event engine and bounded DC behavior. Analog and mixed adapters return `ANALOG_UNAVAILABLE` or `MIXED_SIGNAL_UNAVAILABLE` without capture. `ngspice` is a reserved backend ID with zero execution and instrument capabilities.

API and Hardware freeze `CIRNET_SIMULATION_BACKEND` when they start. A plan carries the provider identity, adapter version, format and serialized payload, which lets a worker resolve the same provider. Unknown, missing or mismatched providers fail explicitly. Document storage and classification are independent of solver availability. Virtual execution follows the existing Lab lifecycle and local RPC into a bounded process worker. The physical path requires observed topology and a separate safety decision.

`CaptureConfiguration.max_events` allows up to 1,000,000 scheduled events. The digital capture has a separate 100,000-sample limit. If observed changes exceed that limit, the engine returns `CAPTURE_LIMIT` without a partial capture and Hardware maps the failure to `UNEXECUTABLE`. See the [capture catalog](capture-catalog.md) and [physical lab safety](physical-lab-safety.md).
