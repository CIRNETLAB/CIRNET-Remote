# FPGA constraints — hardware inputs required

No QSF pin assignments or SDC clock/timing assumptions are invented. EP4CE6/EP4CE10 device/package migration must be verified against the exact chosen board and Quartus pin planner.

TBD_BY_HARDWARE_DESIGN: complete schematic/pinout, bank supplies, dedicated clock/reset/fault pins, clock frequencies/PLL, interface setup/hold delays, asynchronous interlock constraints, reset release and CDC design. Portable scaffold clock ticks are software test units, not board constraints.
