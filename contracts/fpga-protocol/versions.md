# Independent protocol versions

| Domain | Current status |
|---|---|
| CircuitGraph | 1.0, unchanged logical editor schema |
| Assignment / physical Lab contracts | 1.0 |
| Hardware RPC | 2.0, implemented local service wire boundary |
| FPGA logical control envelope | 1.0-scaffold, software/RTL control boundary |
| FPGA register map / binary framing | 1.0-reserved / TBD_BY_HARDWARE_DESIGN |
| Actual physical firmware/profile | UNAVAILABLE without driver and hardware evidence |

Do not derive one version from another. Runtime StationCapabilities still reports FPGA protocol UNAVAILABLE for the absent physical driver; the logical scaffold version does not advertise a working board.
