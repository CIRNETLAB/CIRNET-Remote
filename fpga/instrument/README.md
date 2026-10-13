# EP4CE10 future instrument domain

Target: EP4CE10E22C8N + external SDRAM. **Scaffold/interface only**; all RTL availability, capture-valid, generator enable and SDRAM request outputs remain false.

| Boundary | Required future implementation/evidence |
|---|---|
| Logic Analyzer | Digital input conditioning, sample packing, bounded buffering and measured rates |
| Scope 2CH | Exact ADC part/resolution/interface, two-channel AFE, range/coupling/protection/calibration |
| Generator 2CH | Exact DAC part/interface, output stage, waveform memory, protection/calibration |
| SDRAM Arbiter | Exact SDRAM part/organization, datasheet timings, refresh, arbitration and overflow/backpressure |
| Trigger | Supported channels/edges/levels, armed acquisition semantics and pre/post-trigger buffering |
| Timestamp | Selected clock source, counter width, wrap semantics and measured resolution |
| CDC | Control/acquisition/generator/SDRAM domains, reset release, safe handshakes/FIFOs and constraints |

rtl/top.v exposes control_clk, acquisition_clk, generator_clk and sdram_clk as named domain interfaces. These carry no selected frequency. Capture/generator requests receive no fake acknowledgement or samples. No memory, ADC/DAC pins, SDRAM timings or CDC helper is invented.

All electrical/pin/timing inputs: **TBD_BY_HARDWARE_DESIGN**. Required before enablement: exact board/schematic and datasheets, PLL/clock/reset plan, acquisition/output limits, SDRAM stress tests, protection/interlock tests and target Quartus timing evidence. StationCapabilities remains false/unavailable until each feature is implemented and measured.
