# CIRNET 0.1.4 local release verification

Native Windows verification used isolated external environments and a 15-asset
local release set. Interface and the Remote system use 0.1.4. API, Contracts,
Simulator, Hardware and the FPGA source scaffold use 0.1.2. The published
[release lock](../../../../integration/release-set.json) records the exact asset
digests and producer revisions.

| Gate | Result | Evidence |
| --- | --- | --- |
| Contracts and installed SDK | PASS | 516 Contracts tests, independent allocator checks, exact API OpenAPI export, and npm runtime and type conformance. |
| Simulator and Hardware | PASS | 133 Simulator tests and 126 Hardware tests. Independently rebuilt wheels matched the selected wheels. |
| FPGA scaffold | PASS | 31 tests and both required RTL testbenches using the pinned toolchain. |
| Interface | PASS | 1,498 unit tests, script checks, unit and E2E TypeScript checks, module boundaries and a production build. |
| Remote API | PASS | 492 tests on Python 3.14 with the selected wheels. |
| Remote release and launcher regression | PASS | 326 initial passes and seven successful targeted reruns after updating release fixture paths and versions. |
| Native first start and Doctor | PASS | Fresh release environment installed the local set and reached Hardware RPC, API and Web health checks. Doctor reported 15 of 15 required checks ready. All three ports were free after shutdown. |
| Hosted Actions, full browser E2E, PostgreSQL restore and physical FPGA | NOT RUN | These gates are outside this local verification record. |

The installer accepts the canonical 0.1.4 profile. Previous releases remain
available under their original GitHub tags for historical reference.
