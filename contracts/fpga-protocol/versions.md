# Independent protocol versions

| Domain | Current status |
|---|---|
| CircuitGraph | 1.0/1.1 legacy schemas retained; additive 1.2 for flexible assemblies and explicit free descriptors |
| Assignment | 1.0 retained; additive AssignmentDefinitionV2 2.0 for Graph 1.2 references |
| Physical Lab contracts | 1.0 retained independently of graph/assignment versions |
| Hardware RPC | 2.0, implemented local service wire boundary |
| FPGA logical control envelope | 1.0-scaffold, software/RTL control boundary |
| FPGA register map / binary framing | 1.0-reserved / TBD_BY_HARDWARE_DESIGN |
| Actual physical firmware/profile | UNAVAILABLE without driver and hardware evidence |

Do not derive one version from another. Runtime StationCapabilities still reports FPGA protocol UNAVAILABLE for the absent physical driver; the logical scaffold version does not advertise a working board.
