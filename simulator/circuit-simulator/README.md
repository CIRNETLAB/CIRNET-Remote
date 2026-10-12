# Lab-First digital event simulator

CircuitGraph 1.0 → offline schema/authoring validation → VirtualExecutionPlan → deterministic EventQueue / DigitalNet / DigitalDevice / DeviceRegistry / ClockSource → observed event capture. Supported initial models: switch/input, AND/74HC08 quad gates, NOT, OR/XOR, LED/probe, clock. Known editor board/instrument visuals create no electrical nets. Other models report UNEXECUTABLE, not a fake result.

Nanosecond integer simulation time and configurable digital transport delay (default model 8 ns) are software models, not measured component timing or electrical limits. Floating inputs remain X. Changes at one timestamp settle before capture/evaluation, with stable ordering. Captures contain actual event transitions 0/1/X and a bounded duration; four requested probe channels max, default first four probes/sources. Defaults/budgets: 1 ms capture window, 100,000 queued events, 100,000 capture events; configured limits are software resource bounds. There is no fixed-timestep whole-circuit loop.

VirtualHardwareStation dispatches bounded simulations to a four-process pool, outside FastAPI's event loop. RPC sessions isolate experiments; stop/reset invalidates generations so late results cannot overwrite newer state. AnalogSimulationEngine / SPICEAdapter / MixedSignalCoordinator are explicit UNAVAILABLE boundaries; no SPICE dependency or fake analog capture.

Install from root: pip install -e . -e './simulator/circuit-simulator[test]'. Tests: pytest -q simulator/circuit-simulator/tests. Real REST→RPC→worker AND integration is in tests/integration/test_virtual_lab_execution.py. Initial grading supports expected signal values held between event timestamps and explicit exercised truth-table vectors.
