# Circuit Simulator

Software-only VirtualHardwareStation foundation for the Lab-First Mini PC. Current authority: ../../docs/ARCHITECTURE.md. R5 implements discrete-event digital execution; analog requires a real AnalogSimulationEngine/SPICEAdapter and otherwise reports unavailable. Primitive implementation below is the pre-R5 state.

The initial implementation intentionally contains only deterministic digital primitives and a starter 74HC08 functional model. It is not a timing-accurate SPICE simulator and does not claim to model propagation delay, analog behavior, or real hardware limits.

## Test

```bash
pytest -q simulator/circuit-simulator/tests
```

Future work should add event scheduling, sequential devices, virtual clock/trigger behavior, Circuit Graph execution and virtual capture while keeping the same application-level contracts used by Physical Hardware.
