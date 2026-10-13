# Post-R7 H0–H6 final verification — 2026-10-13

Branch: `refactor`. Resume HEAD: `6bbd1b4`, clean linked worktree. Preserve the existing H0–H4 phase commits and user update (backend H5 plus 3D navigation); complete pending H5/H6 without rewriting history. Canonical authority: [ARCHITECTURE.md](../ARCHITECTURE.md). Exact requested plan and historical evidence: [migration ledger](../MIGRATION_LAB_FIRST.md).

| Phase | Commit |
| --- | --- |
| H0 | `0619141` |
| H1 | `99b4566` |
| H2 | `af0b0ce` |
| H3 | `6dd6c34` |
| H4 | `d16e274` |
| H5 | `a0bbbb2` |
| H6 | Resolve exact subject `docs(post-r7-h6): align architecture and migration evidence` in Git; self-SHA cannot be embedded in its own commit |

Original hardening baseline at `f5df5ac`: context PASS, Python184 PASS/1 skip, frontend225 PASS/build PASS. Resume baseline at `6bbd1b4`: context/generated PASS, Python342 PASS/1 skip, frontend264 PASS/build PASS (966.83 kB JS). Supported project environment includes grpcio-tools; sandbox localhost EACCES was classified as environmental and identical tests rerun with approved native/loopback access.

## Architecture corrections and final review

DetectedTopologyGraph → safety → TopologyResolver → ResolvedLabBindings → topology diagnostics → compiler/executability → policy → infrastructure/guarded power-up. Teacher/reference node IDs are not student route IDs. Supported component quantities and pin/net incidence determine mappings, with explicit ambiguity. Compilation never repairs internal student wiring. Safety, topology, function and assessment remain independent.

H5 displays structured safety/component/net/pin evidence, endpoint resolution/confidence, expected/observed signals and exercised truth-table cases in the existing Inspector. X and absent response differ; uncertain locations are not guessed/highlighted. H2's on-demand shared/cancelled capture request cache and truthful empty Scope remain green.

Independent review found three Important issues (no Critical/Minor):

1. Greedy terminal aliases caused false resource shortages. RED fixtures with competing resources now allocate aliases/resources jointly on proven observed nets, without modifying wiring.
2. 100k sample JSON exceeded gRPC's default 4 MiB receive bound. Real loopback RED replies measured 4.76 MB/30.76 MB for short/long names. ReadCapture now uses bounded NCAP bytes; metadata JSON has no samples. Both valid 100k cases pass losslessly below the receive bound.
3. Scan-declared ambiguity and zero-confidence pins were ignored. RED cases now withhold uncertain reference inference while preserving explicit fixed terminals. Supplied positive confidence propagates conservatively; overlapping component IDs cannot overwrite reference/student evidence. Binary descriptors also reject boolean counts/durations (two RED→GREEN cases).

The author completed one bounded fix pass and ran all gates below. The reviewer did not re-review the fixes; the new regression tests and full green suite are the fix evidence.

## Final matrix

| Gate | Result |
| --- | --- |
| context check / generated Lab snapshots | PASS / PASS |
| Full supported Python suite | 355 PASS / 1 SKIP |
| contracts | 68 PASS |
| integration | 13 PASS |
| frontend Python guardrails | 12 PASS |
| deployment | 3 PASS |
| FPGA | 7 PASS / 1 SKIP |
| API | 149 PASS |
| Hardware Service | 67 PASS |
| simulator | 29 PASS |
| frontend `npm test` | 269 PASS |
| frontend production build | PASS, 158 modules, 977.38 kB JS |

One tool skip: Icarus/vvp absent, so RTL behavior test is unverified locally; static pyslang compilation/elaboration passes. FPGA CI requires Icarus. Remaining warnings: one Starlette/httpx deprecation and existing Vite bundle advisory. RefResolver was replaced with the current registry; four CircuitGraph tests pass under warning-as-error. No test deleted/excluded to reach green.

## Required architecture regressions

| Requirement | Explicit automated coverage |
| --- | --- |
| 1–2 Different teacher/student IDs; compile student node | API `test_topology_resolution.py`: arbitrary_nodes, reference_n1/student_n42 and manager Run |
| 3 Safe wrong wiring runs then function FAIL | API `test_learning_feedback.py`: safe_wrong_wiring under all assessment policies |
| 4 Safe wrong IC can run | API `test_lab_lifecycle.py`: safe_wrong_ic_topology_mismatch |
| 5 Safe opaque IC runs guarded | Hardware `test_physical_station.py`: safe_opaque_component_runs_guarded |
| 6 VCC–GND short cannot run | API `test_learning_feedback.py`: reported_vcc_ground_short under all policies |
| 7–8 Required unresolved endpoint blocks; ambiguity never guessed | API topology resolution/execution hardening: equally_valid_matches, declared_uncertainty, fixed bindings survive |
| 9 Duplicate same-type quantities | API topology resolution/execution hardening: two_identical_parts, unique chain and genuine symmetry |
| 10–12 Opaque UNKNOWN, valid pin/node references, reject channel 0 | `tests/contracts/test_post_r7_contracts.py`, browser post-r7-contracts tests |
| 13 Capability physical slots 0/1/2/FIFO release | API `test_lab_capacity.py` and lab lifecycle FIFO one-slot test |
| 14 Safe spawn/config/close/deterministic capture | Hardware `test_simulation_workers.py` |
| 15 Large capture absent SQL/WebSocket; actual RPC works | API `test_capture_storage.py`: 100k externalized; integration `test_capture_rpc_data_plane.py` |
| 16 Capture ownership | API capture_storage REST owner check/delete; browser owner-denial cache test |
| 17 Generator capabilities/lifecycle consistent | API instrument_lifecycle; Hardware instrument_capabilities; browser instrument-capabilities |
| 18 Independent UI states | browser learning-feedback / lab-first tests: SAFE+MISMATCH+FAIL, SAFE+UNKNOWN+NO_RESPONSE, UNSAFE/ambiguity |
| 19 CircuitGraph/Three.js preserved | unchanged editor/interaction/scene/history/camera suites plus full type/build checks |
| 20 Truthful physical FPGA unavailability | FPGA lab-first-control transport/instrument tests and Hardware physical/virtual capability tests |

## Provenance and intentional limitations

Historical R0–R7 prompt recovered byte-for-byte from Git blob `1019e14fd1a9c9489a5353d5a539059f144b792d` at R7 `842b3d1`, removed later by `f5df5ac`. SHA256 `cce3f52cec112f5b9125d20bf48cfb68a38f290f1453714a491f7ebb0cdc4985`; LF attribute plus a hash regression protects the archived artifact. No reconstructed prompt/history was invented.

Review exclusions remain explicit: unrelated user 3D navigation preserved; physical topology scanner electronics, analog routing, Scope ADC/AFE, Generator DAC/output stage, SDRAM, actual transport, pinout and timing closure unavailable. Multi-process scheduling/live PostgreSQL and automatic capture retention remain separate deployment work; V1 uses one API scheduler and explicit owner deletion. No numerical confidence or electrical limits were invented.

Rulings and their costs are recorded in the migration ledger: preserve commit history and put final-review fixes in H6; joint proven-net resource allocation; conservative unscoped/zero-confidence inference; unpublished binary RPC v2 requiring both local services rebuilt/restarted; retain honest V1/hardware exclusions. No deferred Minor findings.

Software merge recommendation: **READY for user review**, with the explicitly documented Icarus tool skip. Physical/electrical readiness is not established. Keep branch/worktree intact; **DO NOT MERGE. DO NOT PUSH TO MAIN.**
