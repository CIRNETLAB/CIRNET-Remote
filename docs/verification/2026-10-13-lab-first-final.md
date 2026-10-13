# Lab-First R0–R7 final verification

Branch refactor; final commit subject `refactor(r7): align FPGA and physical hardware scaffold`. Exact final HEAD is resolved from Git in the final user report; no extra implementation commit or merge/push is created to record its self-SHA.

| Gate | Result |
|---|---|
| scripts/check_context.py | PASS |
| pytest -q | 184 PASS, 1 tool SKIP |
| tests/contracts | 36 PASS |
| tests/integration | 9 PASS |
| tests/frontend | 12 PASS |
| tests/deployment | 3 PASS |
| tests/fpga | 7 PASS, 1 tool SKIP |
| services/api/tests | 51 PASS |
| services/hardware-service/tests | 31 PASS |
| simulator/circuit-simulator/tests | 29 PASS |
| npm test | 225 PASS |
| npm run build | PASS; 152 modules, JS936.75 kB/gzip288.36 kB |
| Both RTL tops + testbench via pyslang12.0.0 | Compile/type-check/elaboration PASS |
| Icarus/vvp behavior / Quartus synthesis | Unavailable locally / not run |
| Independent final reviewer | 49 PASS, 1 tool SKIP; no remaining actionable finding |

The named scopes overlap full-suite totals. Re-run the same matrix after R7 commit and verify clean Git status plus separate R0–R7 subjects. Known non-blocking warnings: Vite >500 kB chunk advisory; Starlette httpx deprecation; two existing jsonschema.RefResolver deprecations. No unrelated bundle optimization.

Architecture drift search returns only archive/history/audit, input prompt examples and guardrail search strings. Active authority remains ARCHITECTURE.md Lab-First v3.1; PostgreSQL production, Mini PC host, separate logical/physical graphs, independent SAFETY/TOPOLOGY/FUNCTION, endpoint-only routing and truthful unavailable capabilities.

R0 archived six legacy authorities with SUPERSEDED banners into docs/archive/legacy-v1 and renamed deployment/Mini-PC → deployment/mini-pc. Icon artwork/Git blobs remain unchanged, with checkout LF normalization to fix original baseline byte drift. Phase records/rulings/costs are in MIGRATION_LAB_FIRST.md. Browser capture proof is in 2026-10-13-lab-first-r6.md; isolated helper processes and agent browser tab are cleaned up.

Limitations: electrical topology scanner/switching/protection/watchdog driver, board pins and measured voltage/current limits, transport framing/IC, ADC/AFE, DAC/output stages and SDRAM part/timing remain TBD_BY_HARDWARE_DESIGN. R7 is scaffold/interface only. Local Icarus simulation is unverified; FPGA CI installs Icarus and executes the testbench. Async fault/reset/CDC mapping and Quartus timing still require target-board validation. Analog virtual/physical, Scope/Generator physical capture/output and trigger acquisition stay unavailable. No invented samples or hardware success.

Backend scheduling remains one API process, one physical shared-fabric slot, four bounded virtual workers. Production PostgreSQL/target Mini PC/load30–50 connected users were not deployed or measured. Anonymous server sessions provide ownership; full login/RBAC remains future deployment work. Topology semantic equivalence is UNKNOWN/AMBIGUOUS where unresolved. Legacy saved queue records lacking new admission sequence cannot reconstruct prior Run ordering.

Suggested user review before any later merge: canonical architecture/versions and migration rulings; physical lifecycle and cleanup/quarantine tests; owner isolation/FIFO/restart/Stop safety; actual virtual/function captures; 3D/editor/history preservation; target-tool RTL testbench, pin/protection/ADC/DAC/SDRAM inputs; PostgreSQL/auth/load deployment validation. **DO NOT MERGE. DO NOT PUSH TO MAIN.**
