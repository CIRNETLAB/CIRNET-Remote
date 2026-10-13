# FPGA scaffold verification

Separate from application VirtualHardwareStation/event simulation.

tb_lab_first_control.v checks the actual abstract control RTL and constant unavailable instrument interfaces. Run locally when Icarus/vvp are present:

```sh
iverilog -g2012 -s tb_lab_first_control -o /tmp/lab-control.vvp fpga/experiment-controller/rtl/top.v fpga/instrument/rtl/top.v fpga/simulation/tb_lab_first_control.v
vvp /tmp/lab-control.vvp
pytest -q tests/fpga
```

Expected behavior marker: LAB_FIRST_RTL_PASS. Pytest fails on compiler/simulation errors; absent local Icarus is explicitly skipped. FPGA CI installs Icarus before both-top syntax and behavior tests. Optional pyslang compiles/type-checks/elaborates both tops and the testbench without pretending to simulate it ([official compiler documentation](https://www.sv-lang.com/user-manual.html)).

Scope: safe reset; scan/prepare/route/power/arm/start guards; clock tick boundary; STOP; short asynchronous fault latch; watchdog; lost route permission; invalid command; unavailable Logic Analyzer/Scope/Generator/SDRAM. No electrical scanner/protection/ADC/DAC/SDRAM timing or Quartus synthesis is proven.
