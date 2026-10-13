# Quartus target projects

No target project/pin/timing configuration is provided without board inputs. Quartus synthesis, fitter, timing closure and device programming are **not verified** by R7.

Reusable control/instrument interface RTL is compiled separately with slang/Icarus. Async fault latch/reset implementation and CDC must be mapped and checked for the actual Cyclone device, board and protection circuit before deployment. Generated db/, incremental_db/ and output_files/ remain ignored.
