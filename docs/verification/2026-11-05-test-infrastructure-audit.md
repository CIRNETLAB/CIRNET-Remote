# Rà soát hệ thống kiểm thử CIRNETLAB

Ngày 05-11-2026, múi giờ Asia/Saigon. Phạm vi gồm sáu checkout dưới `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO`. Bảng ghi nhận Git lúc bắt đầu. Các nhận định về hiện trạng dựa trên source, fixtures, manifest và workflow ở các revision dưới đây, cùng các phép đo mới trong mục 4.

| Checkout | Nhánh và HEAD | Working tree lúc bắt đầu | Quyền sở hữu |
| --- | --- | --- | --- |
| `cirnet-contracts` | `master` · `524cc7a5e2e65f39077feefe70c7fb2ae3a773d6` | Sạch | Schema, catalog, generated bindings, SDK công khai và DEV allocator |
| `cirnet-fpga` | `master` · `d27c818aca0eb95e9ee8d9b5ba6bda3182909914` | Sạch | Scaffold, giao thức logic, RTL, testbench và toolchain |
| `cirnet-hardware` | `master` · `9a8935b6a596abe2d21ce90416ba3b914e9f36be` | Sạch | Station, driver boundary, gRPC riêng, NCAP và tiến trình worker |
| `cirnet-interface` | `master` · `f1fe0c4738e105727aff1a331327caf7172cdf5f` | Sạch | Web, editor, store, assets và assertions trên trình duyệt |
| `cirnet-remote` | `master` · `38aea6120920f48cea817827ac2277cce4bef25e` | Sạch | API, auth, lease, orchestration, persistence, deployment và điều phối integration |
| `cirnet-simulator` | `master` · `9ec36fa2772ba8227e15ae33fec9710943a9a775` | Sạch | Mô hình, event engine, giới hạn thực thi và backend selection |

Đã đọc `AGENTS.md` tại Hardware, Interface, Remote và Simulator. Contracts và FPGA không có `AGENTS.md` được theo dõi tại các revision trên. Dùng README, hướng dẫn verification, workflow, package scripts, pytest config, release runners và source test/fixture để xác định ranh giới thực tế. Cả sáu checkout đều truy cập được. `cirnet-cli` nằm ngoài phạm vi. Đường dẫn code trong các bảng tính từ root của repo được ghi bên cạnh.

## 1. Danh mục suite và ranh giới

Các lệnh Python dưới đây dùng venv phù hợp và `--basetemp` trong phiên allocator. Các phép kiểm tra nhập API cần cài wheel API ứng viên hoặc chạy từ entrypoint phù hợp trong `services/api`. Các workflow thực tế cung cấp thêm thiết lập nguồn, runtime và credentials.

| Owner và tầng | Suite, fixtures và hành vi bảo vệ | Lệnh hiện có và môi trường | Trigger hiện tại |
| --- | --- | --- | --- |
| Contracts · schema, generator và wire | `tests/contracts/` gồm 37 module. Dùng fixture schema/semantic profiles, baselines, generated model, NCAP và loopback gRPC. Bảo vệ drift của catalog/OpenAPI, cả dữ liệu hợp lệ lẫn không hợp lệ, presence, cancel/retry và fallback tên RPC. | `python -m contracts.codegen.generate_contracts --check`, `python -m contracts.codegen.sync_editor_catalog --check`, `python -m contracts.codegen.sync_breadboard_topologies --check`, `python scripts/check_public_compatibility.py`, `python -m pytest -q`. Ubuntu, CPython 3.11/3.14, Node 26, hai requirements lock. | `contracts.yml` mọi push/PR/manual, hai lane Python. |
| Contracts · distribution và DEV | `tests/test_standalone_distribution.py`, `.github/tests/test_ci_bootstrap.py`, `tools/artifact-paths/test/`. Wheel/sdist, npm public SDK, module graph, import cô lập, từ chối path escape/symlink/worktree và cleanup sai owner. | `python -m build --no-isolation --wheel --sdist --outdir <owned-dist>`, `node scripts/check_public_sdk.mjs --output <owned-sdk-dir>`, `npm --prefix tools/artifact-paths test`, `python -m pytest -q -p no:cacheprovider tools/artifact-paths/test/test_python_bridge.py`; CI cài closure offline và probe `python -I` ở ngoài checkout. | Cùng workflow và matrix Contracts. |
| Simulator · model và backend | `tests/test_events.py`, `test_logic.py`, `test_breadboard_nets.py`, `test_physical_simulation.py`, `test_backends.py`, `test_signal_dispatch.py`. Event ordering, timing/budget, connectivity, rail, ngoại lệ model, backend spoof/tamper/no-exec và worker spawn. Fixture chủ yếu in-memory, parity fixture đọc từ Contracts đã cài. | CI dựng wheel bằng `python -m build --no-isolation`, cài exact wheel và chạy `python -I -B -m pytest "$GITHUB_WORKSPACE/tests"` từ phiên ngoài repo. Ubuntu, Python 3.14, Node 26, DEV, Contracts 0.1.2. | `simulator.yml` mọi push/PR/manual. |
| Simulator · installed/tooling | `test_installed_boundary.py`, `test_brand_compatibility.py`, `test_bootstrap_environment.py`, `test_ci_dependency_python.py`. Exact RECORD, import/ABI, pickle và cấu hình bootstrap. 13 file, 133 ca tính tĩnh theo tham số trên toàn repo. | `python scripts/check_installed.py --wheel <wheel>` và `pip check`; test nằm trong cùng lần pytest đã cài. | Cùng workflow Simulator. |
| Hardware · station, RPC và worker | `test_physical_station.py`, `test_instrument_capabilities.py`, `test_rpc_lifecycle.py`, `test_server.py`, `test_ncap_rpc.py`, `test_transport.py`, `test_virtual_station.py`, `test_virtual_execution.py`, `test_simulation_workers.py`. Fake driver/adversarial payload và loopback thực. Kiểm tra no-driver, revoke/lease/freshness, fail-closed, TCP bind, Stop khi queue bận, wire limits và worker teardown. | Cùng mẫu build và installed pytest `python -I -B -m pytest "$GITHUB_WORKSPACE/tests"`. Ubuntu, Python 3.14, Node 26, Contracts/Simulator 0.1.2, gRPC/protobuf và DEV. | `hardware-service.yml` mọi push/PR/manual. |
| Hardware · installed/tooling | `test_installed_distribution.py`, `test_package_boundary.py`, `test_ci_dependency_python.py`, `test_brand_compatibility.py`. Closure, module provenance, anti-shadow, legacy route thực. 15 file, 126 ca tính tĩnh theo tham số trên toàn repo. | `python scripts/check_installed.py --wheel <wheel>`, `pip check` và cùng pytest. Không cần Interface hay board vật lý. | Cùng workflow Hardware. |
| FPGA · scaffold, package và hostile inputs | `tests/test_tooling.py`, `test_fpga_scaffold.py`, `test_bootstrap_environment.py`, `test_artifact_environment.py`. Archive unsafe, source provenance, toolchain closure, tamper/missing support, parse shape và giả định capability. Cả repo có 20 hàm pytest trước tham số hóa. | `python -B -m pytest -q`, `python -B scripts/build_source.py --output <owned.tar.gz> --provenance integration/source-provenance.json`; CI build hai lần và `cmp`. Ubuntu 24.04, Python 3.14, Node 26, exact wheel Contracts và requirements hash lock. | `fpga.yml` mọi push/PR/manual. |
| FPGA · RTL | `tests/fpga/test_lab_first_control.py`, `fpga/simulation/tb_lab_first_control.v`, `tb_permit_matrix.v`. Reset, watchdog, lỗi bất đồng bộ, permit loss, drive/clock inhibit tức thời, cleanup FAULT theo chu kỳ và safe instrument outputs. | `python -B scripts/install_toolchain.py`, `python -B scripts/check_rtl.py --toolchain-root <owned-toolchain-root>`; CI cấp root qua `CIRNET_FPGA_TOOLCHAIN_ROOT`. Pin pyslang, Icarus/vvp và full executable/support closure. | Cùng workflow FPGA. Remote có thêm gate cho scaffold đã chọn và cấm physical transport. |
| Interface · unit, component và boundaries | 184 file `tests/*.test.ts`. Domain, geometry, editor, camera, auth state, scope điều khiển, recovery và lazy delivery. `tests/helpers/vueSfc.ts` biên dịch SFC thật trên custom host. `tests/auth.test.ts` inject fetch/deferred. `tests/import-boundaries.test.ts` và checker AST khóa import/transitive edges. | `npm test`, `npm run check:boundaries`; local dùng `npx vue-tsc --noEmit -p tsconfig.tests.json` và `node scripts/test.mjs NAME.test.ts`. Node 26, SDK/sdist/DEV exact, `npm ci`. | Interface `frontend.yml` mọi push/PR/manual. Remote có job chạy lại trên Interface đã chọn. |
| Interface · delivery và tools | 8 file `scripts/*.test.mjs`. SDK/resource parity, auth download redirect, cleanup, benchmark harness, native helpers và deterministic clean export. `tests/validator-delivery.test.ts` kiểm module graph và cold process. | `node --test scripts/*.test.mjs`, `npm run build`, `python -B scripts/build_release.py --output-directory <owned-dir>`; Git, Python 3.14, Node 26. | Interface `frontend.yml`. Remote Frontend và browser cũng build bản Interface được chọn. |
| Interface/Remote · native browser | Interface sở hữu 17 file `e2e/*.spec.ts`. Auth cookie, dữ liệu riêng, lost ACK, recover, workflow lab, native input, Web Locks và WebGL. Các route inject lỗi có chọn lọc. Remote điều phối server/DB và evidence. | Remote `python scripts/check_release.py --group browser`, Interface `npm run test:e2e:install -- --with-deps`. Chromium pin, SQLite/captures riêng, API và Hardware thật qua loopback, Simulator worker. Default một worker, zero retry, SwiftShader. | Remote `browser-e2e.yml` push/PR theo paths và manual. Camera 4 project trong `playwright.camera.config.ts` có command chuyên biệt, ngoài lần chạy default này. |
| Remote · API và security/safety | `services/api/tests/test_auth_{security,control,cookie_loss}.py`, `test_request_limits.py`, `test_assignment_admission.py`, `test_lab_lifecycle.py`, `test_operation_identity.py`, `test_control_*`, `test_capture_*`. Raw HTTP/WS, fake gateway, SQLite cô lập và race được điều phối bằng fixture. Bảo vệ CSRF, origin, access, quota, revoke/lease/stop, no-replay, quarantine. | `python -m pytest -q services/api/tests`; API wheel, Contracts/Simulator và verification deps. `postgres_cases.py` không thuộc discovery mặc định. | `backend.yml` push/PR theo paths và Integration `--group python` unfiltered. |
| Remote · tích hợp runtime | `tests/integration/test_virtual_lab_execution.py`, `test_virtual_domains_execution.py`, `test_capture_rpc_data_plane.py`, `test_instrument_path_rpc.py`, `test_simulation_backend_selection.py`, `test_browser_harness_execution.py`. REST, real loopback gRPC, worker, NCAP và teardown. | `python -m pytest -q <các file liên quan>` hoặc `python scripts/check_release.py --group python` có đầy đủ exact wheel, SDK/Interface và FPGA khi collection rộng. | `hardware-service.yml`, `simulator.yml` push/PR theo paths, Integration rộng mọi push/PR/manual. |
| Remote · PostgreSQL | `services/api/tests/postgres_cases.py` dùng PostgreSQL thật và independent writer connections. Migrations, backup/restore, CAS, lock order, fencing, index và no replay. | `python -m pytest -q services/api/tests/postgres_cases.py` với `CIRNET_TEST_POSTGRES_URL` cô lập và backup tools 18. CI dùng `postgres:18.6`. | `integration.yml:285–364`, mọi push/PR/manual. |
| Remote · package, access và biên repo | `tests/contracts/`, `tests/frontend/`, `tests/integration/test_repository_boundaries.py`, `test_fpga_compatibility.py`. Kiểm verify lock/SHA/RECORD, artifact download, SDK/REST parity, compatibility của đúng artifact và release policies. | `python scripts/check_release.py --group contracts`, `--group package`, `--group web`; `scripts/install_release.py` và `scripts/select_ci_release.py`; package lane Python 3.11 khác lane 3.14. | `contracts.yml`, `frontend.yml`, `fpga.yml`, `integration.yml`; `system-artifact-access` là job credential riêng. |
| Remote · launcher, deployment và workflow policy | `tests/launcher/test_{dispatcher,doctor,clean,common,console}.py`, `tests/deployment/test_deployment_templates.py`, `tests/test_*`, `tests/contracts/test_release_workflows.py`. Windows launcher/cleanup/ownership, deployment policy, docs và guard cho CI. | Pytest theo path, `python scripts/check_context.py`, `python scripts/check_markdown.py`, `actionlint` trong docs job. Windows PowerShell/cmd cho tests launcher thực. | Docs mọi push/PR; Integration bare pytest chạy Ubuntu nên phần phụ thuộc Windows không có cùng độ phủ. |
| Remote/Interface · hiệu năng và phục hồi release | Remote `tests/integration/test_session_benchmark.py` kiểm harness/cleanup. Load thật qua `scripts/benchmark_web_sessions.py`, Interface có `scripts/benchmark-component-palette.mjs`. `scripts/check_release_rollback.py` chạy PostgreSQL, replay safety và package probes riêng. | `python scripts/check_release.py --group load` dùng 50 sessions, concurrency 10, 8 runs. `node scripts/benchmark-component-palette.mjs`. `python scripts/check_release_rollback.py --run --environment-file <owned-file>`. | Load là opt-in, `--group all` không bao gồm load. Chưa thấy job HIL hay quét dependency chuyên biệt trong YAML được kiểm kê. |

`scripts/e2e_web_server.py:63–86` tạo gRPC server và uvicorn trong cùng một Python process. `test_virtual_lab_execution.py:16–52` dùng TestClient cùng process với gRPC server, có worker thật. Hai luồng đều kiểm wire/logic tích hợp. Smoke cho lỗi vòng đời giữa hai OS process cần chạy riêng, dựa trên cơ chế tách Hardware và API hiện có trong launcher. `run-cirnet.bat -Check -NoBrowser` kiểm startup/health/stop trên Windows và chưa chạy một nghiệp vụ lab qua browser. HIL và khả năng physical là **NOT_APPLICABLE** với scaffold hiện công bố `physicalAvailable=false`.

## 2. Phát hiện và đề xuất

So sánh AST các hàm `test_*` cùng tên và cùng tên file giữa `Contracts/tests/contracts` và `Remote/tests/contracts` thấy 148 thân hàm trùng cấu trúc tại 29 file. Đây là số hàm trước tham số hóa. Helper lấy schema source và helper lấy package resource là hai đường nhập khác nhau. Bảng dưới chỉ định cách giữ cả hai trách nhiệm khi có bằng chứng thay thế.

| Ưu tiên / loại | Vị trí, bằng chứng và chi phí | Đề xuất, rủi ro và điều kiện chứng minh |
| --- | --- | --- |
| P0 · REWRITE | Remote `integration/fpga-version.json:5,10` khóa source/Contracts `0.1.1`. Release lock và `tests/integration/test_fpga_compatibility.py:13–21` yêu cầu `0.1.2`. Cùng test làm đỏ cả `fpga.yml` và `integration.yml`. | Giữ phép đối chiếu source/Contracts độc lập, protocol, register map, B12 và unavailable. Đề xuất đồng bộ khóa hoặc đọc hai version riêng từ một authority có schema. Thử lock lệch riêng source và Contracts đều phải FAIL. Chạy lại hai hosted gate và smoke installed Hardware. Đã tái hiện FAIL cục bộ. |
| P0 · KEEP / NEEDS_REVIEW | Remote `browser-e2e.yml` thất bại trên cả hai ref. `Interface/e2e/depth-artifacts.spec.ts:15` hết 360 giây ở DPR 2. `flexible-placement.spec.ts:114` sai trạng thái `View TOP`; `:278` hết thời gian chờ predicate. | Giữ ba assertions và chứng cứ. Tái hiện từng ca trên đúng Linux/Chromium/SwiftShader, cùng build và viewport, thu trace và step timing ngoài repo. Đối chiếu độc lập native pointer/camera state với frame timing trước khi kết luận nguyên nhân. Không nới timeout, giảm DPR hoặc tăng retries để làm xanh. |
| P1 · CHANGE_CADENCE | Cả sáu repo có cùng SHA chạy trên `master` và tag. `push` và `pull_request` cũng có thể cùng chạy khi push nhánh có PR. Interface và hai workflow Web của Remote dùng concurrency theo `github.ref`, nên ref nhánh và PR khác nhau. | Giữ PR trên trạng thái merge ứng viên, push nhánh mặc định và một pipeline tag chỉ có gate release thực. Giữ manual. So sánh event/checked-out SHA và status aggregator qua PR cập nhật, push nhánh, tag và rerun. Tránh loại bỏ gate nếu artifact/tag identity hay môi trường khác. Chi phí push+PR thực tế chưa có mẫu. |
| P1 · MERGE_CANDIDATE | Remote `hardware-service.yml:79` và `simulator.yml:77` cùng chạy `test_virtual_lab_execution.py` và `test_simulation_backend_selection.py`. `integration.yml:280` chạy lại qua bare pytest. `test_physical_preview.py` cũng nằm trong Backend `:62`. Hai job leaf consumer lặp phần lớn build/install ba wheel, API và Interface. | Hợp nhất phần cùng test, input digest, OS/Python và state. Giữ API-only suite, capture/instrument RPC negatives và artifact installer negatives bằng node ID cụ thể. Đối chiếu union node ID/fixture/inputs trước sau trên PR chạm mỗi ranh giới. Inject lỗi serialization, wrong provider và mất lease để chứng minh fail đúng lớp. |
| P1 · REMOVE_CANDIDATE | Remote `hardware-service.yml:64–76` và `simulator.yml:64–76` cài Interface, SDK và `npm ci` cho danh sách pytest Python. `test_virtual_lab_execution.py:67` đọc Python Contracts, không cần Web. Mẫu RPC/worker cục bộ 21 ca đạt với Interface/SDK env unset. | Chỉ bỏ setup Interface khỏi hai tập targeted sau khi chạy **toàn bộ** danh sách hiện tại với và không có Web, so collection, artifacts và kết quả cả negative paths. Giữ Node cho allocator, giữ Interface setup ở các gate broad/frontend/browser dùng nó. |
| P1 · MERGE_CANDIDATE | Contracts `contracts.yml:55–66` chạy `check_public_sdk.mjs` trực tiếp và thông qua `tests/test_standalone_distribution.py:106`. `generate_contracts.py:133–135,163` và `sync_editor_catalog.py:272–279` dùng cùng phần catalog comparison. | Một lần cho cùng packed bytes, Node/OS và toolchain. Giữ negative private export, no-Ajv runtime, alias, denied output và sdist rebuild. Catalog giữ một phép drift đầy đủ và smoke CLI nếu cần. Sửa artifact fixture để chắc mỗi negative làm gate fail. |
| P1 · MERGE_CANDIDATE / CHANGE_CADENCE | FPGA `fpga.yml:51–53` gọi `check_rtl.py` rồi pytest `test_lab_first_control.py:58–64` gọi cùng CLI. Contracts chạy Node allocator giống nhau qua hai lane Python. | Một lần RTL thực với hai PASS markers, đúng Contracts wheel và toolchain closure; giữ `check_rtl.py` CLI độc lập và các kiểm tra phủ định. Một lane Node allocator với cùng Node/Git/OS, giữ bridge Python và minimum-version packaging ở cả hai version. Một lỗi permit loss hoặc bỏ marker phải làm required gate fail. |
| P1 · MERGE_CANDIDATE | Interface `.github/workflows/frontend.yml:32,34` chạy `scripts/*.test.mjs` rồi `npm test`; `scripts/test.mjs:12` chạy lại `contracts-{consumer,bootstrap}.test.mjs`. Remote `frontend.yml:93,101` chạy AST trực tiếp rồi qua `tests/frontend/test_frontend_shell.py:45–49`. | Mỗi check thực thi một lần với cùng input, giữ entrypoint dev và policy checker độc lập. Chứng minh từng mutation SDK/AST vẫn làm job fail. Không chấp nhận biến bypass mà aggregate không kiểm tra. |
| P2 · MERGE_CANDIDATE / NEEDS_REVIEW | Contracts/Remote `test_circuit_schema.py` có 5/5 thân hàm trùng; `test_validation_profiles.py` có 12/13. Hai cặp chạy 22 ca trên source và 22 ca trên installed Contracts. Remote và Interface cũng so catalog/icons với trust boundary khác nhau, ví dụ `Interface/tests/interface-policy.test.ts:23–72,102` và `Remote/tests/frontend/test_frontend_shell.py:25–112`, `test_logic_catalog.py:21–60`. | Contracts giữ ma trận canonical và mutation. Remote giữ adapter public acceptance, package resources, một corpus parity theo digest, và API/browser behavior. Dùng cùng case ID và expected failure path để chứng minh không mất coverage khi thử thiếu resource, stale SDK, wrong wheel và incompatible shape. Không dời các test HTTP/gRPC về producer chỉ vì dùng chung fixture. |
| P2 · MOVE_TO_LOWER_LAYER | Hardware `tests/test_simulation_workers.py:28–42` kiểm parser Contracts trực tiếp. `test_instrument_capabilities.py:100–109` kiểm presence trên generated protobuf. Hardware `test_brand_compatibility.py:7–15` và Contracts `test_name_compatibility.py:28–35` dùng cùng kiểu env precedence. | Chuyển case parser/protobuf còn thiếu về Contracts. Hardware giữ configured worker count, Stop khi bận, dual-route gRPC và driver boundary. Cần test mutation trên omitted/zero, empty env, queue saturation và alias trước khi chuyển. |
| P2 · MOVE_TO_LOWER_LAYER / KEEP | Remote `test_capture_rpc_data_plane.py:14–43` và Hardware `test_ncap_rpc.py:32–46` có cùng hai bộ 100k samples, wire format và signal ngắn/dài. Remote còn kiểm gateway decode và descriptor boolean `:45–64`. | Hardware giữ raw wire matrix. Remote có thể gộp phần `_stub` raw lặp thành một probe consumer sau khi chứng minh public gateway vẫn reject shape sai, decode lossless và đi qua kênh thật. Giữ `test_instrument_path_rpc.py` vì kiểm compiler → gateway → RPC. |
| P2 · REWRITE | FPGA `tests/test_fpga_scaffold.py:7–31`, `test_lab_first_control.py:16–28,47–55` có kiểm literal Verilog/doc. Interface `scripts/ci-toolchain.test.mjs:5–20` parse YAML theo whitespace. Hardware `test_rpc_lifecycle.py:31–54` monkeypatch private station. | Thay kiểm port/tie-off bằng elaboration/behavior, parse YAML cấu trúc, ưu tiên public response và driver call counters để chứng minh old owner không thể điều khiển. Giữ orchestration seam xác định để tạo race, các guard B12/doc/provenance và fail-closed. Thử comment giả port, YAML đổi format, thiếu bootstrap và stale owner. |
| P2 · CHANGE_CADENCE / MOVE_TO_LOWER_LAYER | Interface `frontend.yml:38,44` build thường và build từ clean export. `validator-delivery.test.ts:8–45` kiểm lazy graph/cold boot riêng. Browser `pending-observations.spec.ts:5–31` và một phần `depth-artifacts.spec.ts` kiểm hành vi nền tảng trình duyệt, hiện cần runner Remote. | Dùng build từ clean export khi cùng input và giữ module graph. Dồn export rộng về PR packaging/lock/toolchain và release nếu smoke coverage giữ nguyên. Tách browser-platform gate sau khi có launcher thật. Giữ native Web Locks/WebGL, scope/auth và integrated run riêng. Thử stale dist, missing page, eager registry và context loss. |
| P3 · NEEDS_REVIEW / CHANGE_CADENCE | Hardware và Simulator có cùng `test_ci_dependency_python.py` và `scripts/build_ci_dependency.py`; workflow leaf hiện không dùng helper này. FPGA/Hardware/Simulator có các test allocator adapter tương tự. | Xác minh mục đích tái hiện lịch sử và mọi external caller rồi mới đổi cadence. Dùng chung logic đã chứng minh giống nhau ở Contracts DEV, giữ consumer adapter smoke và negative ownership ở từng repo. |
| Liên tục · KEEP | `Remote/services/api/tests/test_auth_security.py:82`, `test_auth_control.py:92,130`, `postgres_cases.py`, `Hardware/tests/test_instrument_capabilities.py:145–245`, `Simulator/tests/test_backends.py:82–176`, `Contracts/tests/contracts/test_public_compatibility.py:24–80`, cả hai RTL bench. | Giữ các kiểm tra fail-closed sớm. Chúng quan sát security/safety ở các ranh giới riêng. Các assertion cấu trúc dành cho RECORD/hash, closure, deterministic generation, archive inventory, trigger và bootstrap-before-use có mục đích cụ thể. |

## 3. Chính sách thực thi đề xuất

Ngân sách dưới đây là mục tiêu **wall time** cho một gate trên runner phù hợp, tính cả setup và build. Chúng chưa phải SLA, phép đo tiết kiệm hay timeout tự động. Các lệnh hiện có được ghi theo repo sở hữu. Những phần cần xây được đánh dấu rõ.

| Giai đoạn / gate | Owner, trigger và lệnh | Inputs, môi trường và tiêu chí chặn | Ngân sách đề xuất |
| --- | --- | --- | --- |
| Local · focused | Mỗi repo, khi sửa code. `python -m pytest -q <suite/node ID>` hoặc Interface `npx vue-tsc --noEmit -p tsconfig.tests.json` và `node scripts/test.mjs NAME.test.ts`. Thêm `python -m contracts.codegen.generate_contracts --check`, AST, auth, safety hoặc RTL tương ứng. | Venv/SDK pin, Node 26, allocator, DB/captures riêng. Kết quả hỗ trợ developer. | 2–5 phút cho nhóm thông thường. |
| PR · baseline luôn chạy | Mỗi repo, mọi PR. Manifest/diff resolver và aggregate là **cần xây**. Dùng các lệnh docs/workflow validation, `npm run check:boundaries`, typecheck, smoke Python/contract và check lock phù hợp từng repo. | Không lọc paths ở mức workflow required. Dùng exact merge-base/head và event. Chặn nếu selector fail, thiếu artifact hoặc job bắt buộc chưa đạt. | 3–5 phút. |
| PR · security/safety | Repo sở hữu luôn chạy bộ fail-closed nhanh phù hợp. Mở rộng theo risk labels suy từ source/diff. Pytest auth/CSRF/owner/lease/stop/no-replay, raw RPC revoke/no-driver/drive, backend fail-closed, schema auth/wire mutations. | Required ngay tại PR chạm auth, quyền, lease, cấp điện hoặc safety, kể cả config/docs workflow ảnh hưởng runtime. SQLite cô lập, fake driver và loopback đúng loại. | 5–10 phút. |
| PR · PostgreSQL / RTL / browser bị ảnh hưởng | Remote `python -m pytest -q services/api/tests/postgres_cases.py` khi persistence, schema, auth, assignment/lease/fencing thay đổi. FPGA `python -B scripts/check_rtl.py --toolchain-root <owned-root>` khi RTL/protocol/toolchain đổi. Interface/Remote `node scripts/e2e-interface.mjs <spec>` khi chạm auth/browser/native renderer/lifecycle. | PostgreSQL 18 thực qua `CIRNET_TEST_POSTGRES_URL`, toolchain pin, Chromium pin. Giữ một ca native/DPR đúng với rủi ro. Gate required cho đường bị ảnh hưởng, gồm negative cases. Các policy test hiện cấm filter trong full browser gate phải được cập nhật có chủ đích cho **gate smoke riêng**. | PG 5 phút, RTL 8 phút, smoke browser 12 phút. |
| Integration · candidate và process boundary | Remote điều phối khi một repo đổi public/API/SDK/RPC/lock/installer hoặc candidate được chọn. `python -B scripts/install_release.py --local-artifacts --manifest <local-set.json> --environment-file release-env.json`, rồi áp dụng environment đã xuất và chạy `python scripts/check_release.py --group contracts --group python --group package`. `run-cirnet.bat -Check -NoBrowser` làm startup smoke Windows. Ca browser → API → Hardware → Simulator với các PID riêng **cần xây**. | Checkout đúng candidate, exact wheel/SDK/source digest và runtime hợp lệ. Tách môi trường process và state từng case. Assert actual operation/capture, cleanup và khi Hardware/API rớt thì client fail safe. Chặn integration khi thiếu candidate hoặc không chứng minh được boundary. | 15 phút cho nhóm tích hợp mục tiêu. |
| Pre-merge · trạng thái hợp nhất | Remote và repo thay đổi. Chạy lại các nhóm PR bị ảnh hưởng trên merge SHA; khi tác động không rõ, `check_release.py --group python`, suite producer đầy đủ và gate liên quan. Nếu có merge queue, phát `merge_group` và chạy aggregate trên SHA của merge group. | Required receipt ghi merge SHA, inputs và status chính xác. Dùng trusted event cho draft-access; PR từ fork dùng public assets hoặc báo BLOCKED khi thiếu candidate an toàn. Không chạy PR code không tin cậy cùng release secrets. | 20–25 phút cho đường thường, full browser dùng ngân sách riêng. |
| Post-merge / nightly · regression và kiểm selector | Từng producer chạy matrix đầy đủ, Remote chạy `check_release.py --group all` trên set phù hợp, Interface/Remote giữ matrix visual dài. Thêm job so selected/full manifests và lặp theo corpus thay đổi **cần xây**. | So node IDs và kết quả theo cùng SHA, byte digest và toolchain. Phát hiện miss thì chặn rollout selector, mở lại broad fallback. Nightly không là bằng chứng thay cho required PR. | 25 phút cho non-browser, browser khởi điểm 90 phút hiện cấu hình. |
| Release · exact candidate | Các owner build wheel/sdist/npm/source, Remote cài exact final lock, `python scripts/check_release.py --group all`, `python scripts/check_release.py --group load`, `python scripts/check_release_rollback.py --run --environment-file <owned-env.json>`. Thêm RTL riêng bằng `python -B <candidate-fpga>/scripts/check_rtl.py --toolchain-root <owned-root>` sau khi cài toolchain đã pin, hoặc receipt RTL tương đương trên exact candidate. Interface/Remote full browser và visual gate theo capability. | Cài sạch, digest/trust scope, native browser, PostgreSQL/backup, package provenance, auth/RPC/safety, RTL và performance/load. `--group all` chỉ xác minh provenance/compatibility FPGA. Chốt threshold performance trên baseline ổn định trước khi dùng làm gate. Thêm scanner vulnerability chuyên biệt là đề xuất mới. Chặn release nếu thiếu evidence bắt buộc. HIL bắt buộc khi công bố capability vật lý. Scaffold hiện tại là NOT_APPLICABLE với HIL. | Full browser 90 phút khởi điểm, phần load/HIL **UNKNOWN** đến khi có baseline. |

### Chọn suite và xác nhận trạng thái

1. Đặt một resolver dùng chung cho mỗi pipeline CIRNET, đọc danh mục owner/edges có version. Repo khai báo inputs và gate IDs của mình. Remote tiêu thụ danh mục để điều phối xuyên repo. Quy tắc áp dụng cho cả changed files, base SHA, candidate manifest và lock delta. Rename/delete, thay đổi ngoài danh mục, diff thiếu, lỗi fetch hoặc thay đổi selector đưa về phạm vi rộng và ghi lý do.
2. Edges tối thiểu gồm Contracts schema/OpenAPI/SDK/DEV → mọi consumer liên quan; Simulator → Hardware/Remote; Hardware RPC/driver → Remote; Interface/assets/Vite/Three/Playwright → UI/browser; FPGA RTL/protocol/toolchain → FPGA và Remote compatibility. Lockfile, dependency pin, build/allocator/installer, toolchain và workflow có fan-out rộng, kể cả changes chỉ chạm test helpers. Mỗi gate ghi lý do chọn hoặc bỏ, SHA base/head/merge, version resolver và artifact digests.
3. Tách `candidate` từ source đang thay đổi với `published` từ `integration/release-set.json`. Nhánh CI build Python từ `integration/ci-source-dependencies.json` kiểm đúng ba producer commit đã khóa. Nhánh browser hiện cài API wheel và Interface từ release lock. Source PR hiện tại cần một lane candidate riêng nếu muốn chứng minh compatibility của thay đổi. Mỗi receipt phải bind cả commit/source fingerprint, exact bytes, test selection và toolchain.
4. Required aggregate chạy `always()` trên một status cố định. Nó xác nhận tập gate dự kiến và chỉ nhận `PASS` từ các gate required của đúng SHA. `FAIL` là đã chạy và có lỗi. `NOT_RUN` là chưa chạy. `BLOCKED` là thiếu điều kiện thực thi. `NOT_APPLICABLE` có rule loại trừ, lý do và owner, chỉ hợp lệ khi gate không bắt buộc cho capability/risk đó. `SKIPPED`, cancelled, neutral, receipt thiếu hoặc stale đều không chứng minh PASS. Bộ test của aggregate phải có ca empty selection, job skipped/failed/cancelled, stale receipt, wrong SHA và missing gate.
5. Workflow required không dùng path filter để biến mất. Dùng conditional jobs dưới một workflow luôn xuất aggregate. Tránh push feature-branch trùng PR khi cùng mục tiêu, giữ checks trên default branch. GitHub API trả danh sách rỗng từ `rules/branches/master` cho sáu repo tại thời điểm đọc. Classic protection, cấu hình required check và việc bật merge queue vẫn cần người quản trị xác nhận. Hiện YAML không khai báo `merge_group`. [GitHub về required checks và merge queue](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

## 4. Đo thời gian mới

### Hosted GitHub Actions

Đọc REST workflow runs và job steps theo đúng sáu HEAD vào 05-11-2026. Mỗi ref có **một** run của từng workflow liệt kê, attempt hiện tại. Loại `dynamic` của Dependabot khỏi bảng. Cache của hosted runner **UNKNOWN**. Runner-minutes là tổng `(job.completed_at − job.started_at)/60`, gồm cả jobs fail và phần setup/post. Wall là từ lúc tạo run đầu đến khi job cuối xong trong ref; các job song song chỉ tính một lần vào wall. Queue ở bảng bước là thời gian từ `run.created_at` đến job đầu. Số này mô tả độ trễ quan sát, chưa tách được hàng đợi của GitHub khỏi mọi độ trễ orchestration. [GitHub REST workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs)

| Repo | `master` workflows/jobs · wall · runner-min | Tag workflows/jobs · wall · runner-min | Runs đối chiếu |
| --- | --- | --- | --- |
| Contracts | 1/2 · 151s · 4,05 | 1/2 · 155s · 4,15 | [master](https://github.com/cirnetlab/cirnet-contracts/actions/runs/41997787822), [tag](https://github.com/cirnetlab/cirnet-contracts/actions/runs/41997812715) |
| FPGA | 1/1 · 118s · 1,92 | 1/1 · 121s · 1,97 | [master](https://github.com/cirnetlab/cirnet-fpga/actions/runs/41998597336), [tag](https://github.com/cirnetlab/cirnet-fpga/actions/runs/41998611522) |
| Hardware | 1/1 · 62s · 0,98 | 1/1 · 51s · 0,82 | [master](https://github.com/cirnetlab/cirnet-hardware/actions/runs/41998670333), [tag](https://github.com/cirnetlab/cirnet-hardware/actions/runs/41998688154) |
| Interface | 1/1 · 238s · 3,92 | 1/1 · 236s · 3,88 | [master](https://github.com/cirnetlab/cirnet-interface/actions/runs/41999968864), [tag](https://github.com/cirnetlab/cirnet-interface/actions/runs/41999985476) |
| Remote | 9/12 · 4.602s · 107,53 | 9/12 · 4.656s · 103,95 | [browser master](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000209605), [browser tag](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000220709), [Integration master](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000209464), [Integration tag](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000220772) |
| Simulator | 1/1 · 52s · 0,82 | 1/1 · 61s · 0,98 | [master](https://github.com/cirnetlab/cirnet-simulator/actions/runs/41998281034), [tag](https://github.com/cirnetlab/cirnet-simulator/actions/runs/41998299863) |

Tổng mẫu **234,97 runner-minutes**, gồm 28 workflow runs và 36 jobs, hai ref trên mỗi repo. Đây là thời gian runner quan sát, chưa quy đổi thành billing hoặc mức tiết kiệm. Việc chạy cùng SHA đã được xác nhận cho **master + tag**. Chi phí **push + PR**, cache hit/miss và p95 dài hạn vẫn **UNKNOWN**.

| Bước trên producer, giây quan sát | Setup chính | Build và test |
| --- | --- | --- |
| Contracts, 4 job matrix | Tool/allocator 8–13 | Pytest + allocator 54–100, wheel/sdist/npm 3–5, cài wheel offline 5–9, rebuild sdist 1–2 |
| FPGA, 2 jobs | Closure 7–8, toolchain 33–36 | RTL và pytest gộp 41–47. Lock Linux chọn archive 748.708.972 bytes. |
| Hardware, 2 jobs | Closure và wheel phụ thuộc 10–12 | Build/cài/test installed product gộp 15 |
| Interface, 2 jobs | `npm ci` 3–4 sau bootstrap | AST + runtime 138–139, browser types + build 34–35, clean export riêng 32–33 |
| Simulator, 2 jobs | Closure và wheel Contracts 8 | Build/cài/test installed product gộp 17–20 |

Các bước gộp không cho phép suy ra thời gian test-only hoặc mức tiết kiệm của riêng một lệnh. Giá trị của từng job và wall của mỗi ref nằm ở bảng trước.

| Bước trên Remote, số giây `master → tag` | Setup/dependency build | Test hoặc build sản phẩm | Queue đầu · tổng runner `master → tag` |
| --- | --- | --- | --- |
| Hardware consumer | Build wheel 31 → 34, pip verification 22 → 23 | Pytest 13 → 15 | 2 → 3 · 135 → 107. [master](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000209549), [tag](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000220719) |
| Simulator consumer | Build wheel 39 → 37, pip verification 27 → 23 | Pytest 11 → 11 | 3 → 35 · 111 → 102. [master](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000209813), [tag](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000220874) |
| Backend | Build wheel 21 → 29, install verification + local consumers 19 → 24 | API pytest 79 → 108 | 2 → 3 · 148 → 192. [master](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000209542), [tag](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000220729) |
| Integration `repository-contracts` | Build wheel 37 → 38, pip verification 28 → 28 | Runner Python 263 → 283, **FAIL**. Tag có 1.533 pass, 164 skip, 1 fail FPGA. | 2 → 3 cho workflow · 363 → 381 riêng job. |
| Integration `postgresql-migrations` | Container 22 → 21, backup tools 12 → 8, build wheel 39 → 29 | PostgreSQL pytest 8 → 7, **PASS** | Cùng workflow · 132 → 111 riêng job. |
| Remote Frontend | Build wheel 29 → 21, install verification 23 → 19 | `npm test` gồm typecheck 133 → 81, build 28 → 17, Python 12 → 7 | 2 → 67 · 291 → 182. [master](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000209652), [tag](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000220770) |
| Remote FPGA | Cài toolchain 34 → 35, pip verification 22 → 23 | RTL 20 → 20 **PASS**, consumer compatibility **FAIL** | 2 → 38 · 108 → 111. [master](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000209634), [tag](https://github.com/cirnetlab/cirnet-remote/actions/runs/42000220847) |
| Remote browser | Install services/tools 33 → 31, Chromium 22 → 23 | Typecheck/build 34 → 35, Playwright + harness 4.450 → 4.454, upload 18 → 17, **FAIL** | 3 → 57 · 4.599 → 4.599. |

Các bước được liệt kê là phần đã phân loại, phần còn lại nằm trong tổng runner. Ví dụ Backend gộp cài verification, build/cài API và provenance trong một bước, nên thời gian build API riêng trên CI là **UNKNOWN**. Browser chiếm khoảng 71–74% runner time Remote của hai ref đã đo. Log tag ghi Ubuntu 24.04 x64, Python 3.14.9, 4 CPU affinity và khoảng 15,6 GiB RAM. Kết quả có 58 ca, 54 PASS, 3 FAIL, 1 skip cho capture lịch sử opt-in. Phần chậm ghi theo file gồm sealed packages 14,7 phút, contacts/wires 10,1 phút và labels 5,6 phút. `playwright.config.ts` đặt retry 0, nên số liệu này không do retries. Nguồn log đã đọc chưa phân loại đủ 164 ca skip của broad Python theo lý do. Giữ chúng ngoài số PASS và yêu cầu audit skip reason trước rollout. Đọc timeout/trace trong lần tái hiện browser riêng trước khi thay đổi cadence hoặc thử shard.

### Đo chọn lọc trên Windows

Windows local, CPython 3.14.4, Node 26.12.1, venv mới và phiên DEV allocator chung với Git context của sáu repo. Đặt `TEMP`, pip cache, pytest basetemp, SQLite và captures ra ngoài mọi checkout. Wheel Contracts, DEV, Hardware và Simulator lấy theo release lock và kiểm SHA. Test sources lấy từ checkout hiện tại. Python test runner đo thời gian tiến trình con từ khởi động đến exit, có cả collection. Mỗi dòng một lần trừ chỗ ghi hai lần. Cache OS chưa reset, `warm` chỉ nghĩa là venv đã cài và các lần chạy liên tiếp.

| Phép đo | Trạng thái | Wall cục bộ |
| --- | --- | --- |
| Setup cold trong session mới: tải 4 wheel, tạo venv, pip install, pip check | PASS | 3,47s tải và hash, 14,88s tạo venv, 104,55s cài, 3,28s pip check |
| Dựng API wheel từ Git export của HEAD, cài vào venv, `pip check` | PASS | 4,52s build, 2,20s cài, 1,09s kiểm closure |
| Contracts `test_circuit_schema.py` + `test_validation_profiles.py` từ source | PASS, 22 ca | 2,25s |
| Cùng hai file ở Remote, đọc installed Contracts | PASS, 22 ca | 1,35s |
| Simulator `test_events.py`, `test_backends.py`, `test_signal_dispatch.py` trên wheel, Python `-I` | PASS, 52 ca | 4,84s |
| Hardware `test_server.py`, `test_ncap_rpc.py`, `test_rpc_lifecycle.py` trên wheel, Python `-I` | PASS, 15 ca | 2,12s |
| Interface `node --test scripts/environment.test.mjs scripts/ci-toolchain.test.mjs` | PASS, 3 ca | 0,15s |
| Remote `test_auth_openapi.py`, `test_auth_configuration.py`, `test_control_ownership_unit.py` | PASS, 19 ca | 3,96s |
| Remote `test_same_origin_cookie_without_csrf_cannot_create_an_experiment` và `test_read_requests_and_viewer_heartbeats_never_extend_physical_lease` | PASS, 2 ca | 4,41s |
| Remote `test_capture_rpc_data_plane.py`, `test_virtual_lab_execution.py`, `test_simulation_backend_selection.py`, không cài Interface | PASS, 21 ca | 10,85s |
| Remote cài scaffold FPGA public bằng exact SHA | PASS | 22,55s gồm download, extract, provenance |
| Remote `test_selected_fpga_source_and_installed_contracts_keep_independent_versions` | FAIL, tái hiện lock cũ | 6,69s |
| Remote `test_selected_scaffold_never_enables_installed_hardware_transport` | PASS, 1 ca | 1,20s |
| Kiểm báo cáo với `scripts/check_context.py`, `scripts/check_markdown.py` và `tests/test_markdown_links.py` | PASS, 36 Markdown được kiểm và 4 ca pytest | Không dùng làm số đo hiệu năng |

Hai lần chạy nhóm auth/lease trước khi cài API wheel dừng ở collection (`No module named app`), là lỗi setup phép đo. Sau khi cài wheel ứng viên, lần chạy rộng trong sandbox chạm giới hạn 360s ở fixture đầu và không có kết quả assertion. Timing suite auth rộng cục bộ là **UNKNOWN**. Hai dòng auth trong bảng là lần chạy mẫu ngoài hạn chế sandbox, vẫn dùng đúng venv/DB/captures cô lập. Dữ liệu hiện có chưa đủ kết luận nguyên nhân timeout của lần chạy rộng.

Trình duyệt đầy đủ, PostgreSQL thật, RTL simulator và load **NOT_RUN cục bộ** trong audit này. Kết quả hosted trong bảng là nguồn riêng. Thiết bị thật **NOT_APPLICABLE** cho scaffold hiện công bố, và không có chứng cứ HIL. Test count tĩnh ở mục 1 khác số ca chạy. Chưa đo runtime full local, hit rate hay mức tiết kiệm sau tối ưu.

## 5. Lộ trình, chứng minh và rollback

1. **P0, khôi phục baseline.** Chốt FPGA lock nhất quán và tái hiện ba browser failure ở đúng revision/toolchain. Giữ hồ sơ lỗi theo case, assertion và phase. Chạy lại Remote FPGA/Integration và full browser trước khi dùng baseline làm tiêu chí rollout. Giữ trace trên CI artifact ngoài checkout và thu nhận skip reason có chủ đích.
2. **P1, giảm execution/setup lặp trước.** Xử lý branch/tag scheduling, sau đó hợp nhất hai consumer workflows cùng phạm vi và các invocations thật sự giống nhau trong Contracts, FPGA, Interface. Chạy workflow cũ và workflow thử ở chế độ quan sát trên cùng candidate. Đo ít nhất 3 lần cold và 3 lần warm trên cùng lớp runner. Ghi queue, setup, build, test, upload, teardown, wall và tổng runner-minutes riêng. Giữ Node allocator và cài fresh per job. Nếu cache artifact, khóa theo source SHA, SHA archive, lock digest, OS/arch, Python ABI, Node và toolchain, rồi rehash trước dùng. Không chia sẻ venv, SQLite, captures, token hay kết quả job thất bại.
3. **P2, chạy selector song song với full.** Dùng corpus thay đổi API-only, auth/lease, Hardware RPC, Simulator backend, Contracts schema/DEV, Interface renderer, FPGA RTL, lock/build/workflow, selector, rename và unknown. Trên cùng candidate, so union case IDs, skips, artifact provenance và failure coverage. Thử các lỗi có kiểm soát trong export ngoài repo, ví dụ wrong Contracts digest, stale OpenAPI, leaked private SDK export, wrong RPC field, lease/power stale, missing PostgreSQL fence, permit fail-open và missing browser capability. Mỗi lỗi phải đỏ ở gate liên quan trước khi selector thành required.
4. **P3, đổi owner hoặc assertion có kiểm chứng.** Chuyển nhóm parser/protobuf/corpus có bằng chứng sang repo sở hữu, giữ consumer integration tối thiểu. Tách Web Locks/renderer-only khỏi system stack khi có runner trình duyệt thật tương đương. Chỉ shard browser khi mỗi shard có ports/state và resource budget riêng, có phân tích chênh lệch race hoặc rendering. Khi nightly/full phát hiện lỗi mà PR chọn thiếu, đánh dấu selector FAIL và fallback rộng ngay.
5. **Rollback theo từng bước.** Giữ workflow broad và lệnh release gốc trong giai đoạn thử. Nếu thiếu coverage, đo sai input hoặc required status sai, chuyển resolver về broad, vô hiệu cache receipt và revert riêng commit cadence/selector. Rerun trên merge SHA hiện tại với artifact ứng viên đúng digest. Quy trình rollback của CI tách khỏi rollback ứng dụng và phục hồi DB/captures, vốn có gate riêng trong `check_release_rollback.py`.

Thứ tự trên giữ các test bảo vệ auth, lease, an toàn điện, no-replay, packaging, RTL và native browser. Chi phí có bằng chứng cao nhất nằm ở scheduling và setup/build lặp. Việc bỏ assertion chỉ được xem xét khi replacement có cùng phạm vi phát hiện lỗi đã được chứng minh.

## 6. Triển khai P0 và P1

P0 đồng bộ hai khóa FPGA và Contracts độc lập sang `0.1.2`. Hai ca hồi quy mới kiểm tra mỗi khóa với trường tương ứng trong system release manifest. Cả lỗi lock cũ và lỗi tích hợp với scaffold chính thức đều được tái hiện trước khi sửa. Sau khi sửa, 49 ca tập trung đạt và consumer vẫn xác nhận `physicalAvailable=false`, protocol `1.0-scaffold`, register map `1.0-reserved` và từ chối ví dụ B12 không khả dụng.

Browser chạy trên Docker Ubuntu 24.04, Node 26.12.1, CPython 3.14.9, Playwright 1.64.1 và Chromium r1248 với SwiftShader. Dùng API, Hardware, Simulator và Contracts từ đúng system lock, cùng SQLite, captures và runtime riêng. So sánh giữ nguyên spec gốc, assertions, DPR, flags, timeouts, retries và baselines.

| P0 browser | Chẩn đoán | Kết quả cục bộ |
| --- | --- | --- |
| WebGL hidden-layer DPR 2 | CI hết 360s ở tư thế lịch sử cuối. Profile QUAD closeup cho thấy render khôi phục toàn frame mất khoảng 11,4s, dù lượt chẩn đoán chỉ thay đổi trong ROI. | Khôi phục theo cùng clip và vẫn đọc toàn bộ framebuffer. Original Remote runner PASS DPR 1 trong 135,692s và DPR 2 trong 295,967s, 60 tư thế không rò pixel. Bốn guard native xác nhận khôi phục đúng clip kể cả khi ném lỗi, framebuffer toàn phần trùng byte và scissor/material/callback được khôi phục. |
| Placement multiview và gallery closeups | Trace CI có những frame cũ giống từng pixel sau khi thao tác camera. Probe 1920×1080 đo một lượt native paint khoảng 4,6s dù Three.js trả về sau 6,5ms. Lượt đó chưa đưa camera sang tư thế yêu cầu. | ViewCube hoãn frame timestamp cũ và chuyển thẳng tới tư thế cuối khi lượt vẽ trước dài hơn ngân sách nội suy. Máy phản hồi nhanh vẫn nội suy. Cả hai spec nguyên bản PASS trên cùng container, 312,842s sau sửa so với 362,094s trước sửa. Bản cũ cũng PASS cục bộ, nên trace hosted là bằng chứng hai timeout gốc. Hai hồi quy deterministic fail trước sửa, pass sau sửa. |

P1 giới hạn source push vào `master`, giữ các trigger PR và manual đã có. Tag `v*` trên Remote vẫn chạy browser theo artifact phát hành, system artifact access và PostgreSQL thật. Browser trên PR và push `master` chọn Interface tại commit `66845b01f9b02b70e6ec28ececd163133cdcdfa2` và giữ API wheel từ system lock. Cấu hình tải source công khai ghi lại commit/tree và không nhận release read credential. GitHub xác nhận sáu `master` không có status check bắt buộc cũ cần di chuyển trước khi gộp job.

Hai workflow consumer Remote dùng chung một lần cài wheel và một lệnh pytest. Đối chiếu trên Windows với wheel dựng từ đúng ba source pin cho thấy 61 ca Hardware và 42 ca Simulator có 17 node ID trùng. Lệnh gộp đạt **86/86**, đúng hợp và không skip. Job vẫn giải nén Interface đã xác minh vì guard mặc định thực hiện collection toàn repo. Kết quả giống nhau khi bỏ SDK bootstrap và `npm ci` của Interface. `Integration / repository-contracts` giữ nhóm Python rộng trên PR và `master`. Các số trên là một phép đối chiếu local và chưa đo mức tiết kiệm hosted.

Contracts còn một kiểm tra packed SDK trong pytest cho mỗi Python lane, giữ Python bridge trên cả 3.11 và 3.14, và chạy Node allocator một lần trên Node chung. FPGA gọi RTL một lần từ test bắt buộc hiện có, vẫn yêu cầu đủ hai marker hành vi. Interface dùng `npm test -- --all-script-tests` để chạy mỗi script suite một lần. Remote Frontend chạy AST trong bộ pytest hiện có trước `npm test` và build.

| Xác minh sau chỉnh sửa | Kết quả |
| --- | --- |
| Remote Browser toàn bộ | PASS 57/58, 1 skip theo thiết kế cho capture lịch sử opt-in. Hai shard cục bộ độc lập bao phủ đúng 58 ca gốc trong 17 spec, mỗi shard giữ một worker và retry 0. Wall lần lượt 19,8 và 44,4 phút. Hosted gate vẫn chạy unsharded. |
| WebGL full-frame equivalence | PASS 78/78 trên hai DPR, 11.850.288 điểm pixel, 194.249 native first hits. Byte khác biệt bằng 0 ở buffer gốc, buffer chẩn đoán và buffer khôi phục. Hai positive controls phát hiện đúng 11 và 328 pixel. |
| Contracts và DEV | PASS 516 pytest, 3 CI policy, 3 Python bridge, 18 Node allocator, exact packed SDK, build wheel/sdist, cài wheel cô lập và dựng lại wheel từ sdist. SRI vẫn in từ cùng lượt kiểm tra packed SDK. |
| FPGA | PASS 29 ca Windows trong lần chạy rộng và ca RTL thực thi khi chạy lại riêng ngoài sandbox. Hai marker `LAB_FIRST_RTL_PASS` và `PERMIT_MATRIX_RTL_PASS` được xác nhận từ receipt của toolchain đã khóa. Lượt sandbox ban đầu lỗi Icarus khi biên dịch bench và không có stderr. |
| Hardware và Simulator | PASS 126 và 133 ca trên Windows với source-built wheels và provenance đã kiểm. |
| Interface | PASS 31 script tests, 1.500 runtime tests, 229-module AST, E2E types và production build. |
| Remote Python trên Ubuntu | PASS toàn bộ lệnh `check_release.py --group python` với artifact phát hành đã xác minh, 1.533 ca pass, 143 skip theo môi trường. |
| Remote Python trên Windows | PASS toàn bộ sáu lệnh `check_release.py --group python`, 1.707 ca pass, ba skip do quyền file-symlink. Dùng các wheel dựng từ source pin CI và sản phẩm Interface/FPGA đã xác minh. Lần chạy trước có một lỗi Git do basetemp dài. Cùng ca và toàn bộ suite đạt ở phiên allocator ngắn hơn, giữ nguyên fixture. |
| Remote PostgreSQL | PASS 18/18 với server 18.6 và client 18.6 thực, gồm backup/restore, migrations và writer races. Database cô lập trong mạng Docker nội bộ. |
| Workflow và phạm vi | PASS Actionlint 1.7.12 trên 13 workflow. Đối chiếu trigger với Git baseline giữ PR/manual và hai luồng tag Remote. Spec browser, Chromium pin, viewport, DPR, assertions và cấu hình retry gốc giữ nguyên. |

## 7. Triển khai P2

Integration chạy thêm hai job quan sát. `selector-observation` chạy độc lập
và song song với `repository-contracts` trên cùng commit. `selector-comparison`
đọc hai receipt của cùng lượt chạy sau khi cả hai job kết thúc. Chỉ chế độ
quan sát có thể loại ca pytest sau collection. Job `repository-contracts` vẫn
chạy toàn bộ gate Python. PostgreSQL, Browser, RTL, system artifact access và
các gate ở repo sản xuất giữ lệnh và lịch cũ. Hai job mới dùng artifact công
khai đã khóa digest và quyền `contents: read`.

Phạm vi hẹp ban đầu gồm endpoint health của Remote và các tài liệu đã duyệt.
Corpus kiểm tra API, auth và lease, RPC Hardware, backend Simulator, schema
và DEV của Contracts, renderer Interface, RTL FPGA, lock, build, workflow,
chính selector, rename và đầu vào không rõ. Thay đổi chưa được duyệt, thay đổi
liên repo thiếu artifact của ứng viên và Git range thiếu bằng chứng đều kích
hoạt chế độ full. Thay đổi producer thực tế đi vào Remote qua các lock đã duyệt.
Receipt ghi lý do chọn, tập case ID, kết quả theo từng ca và danh tính đầu vào.
So sánh giữ skip riêng, liệt kê ca ngoài phạm vi và đánh dấu `FAIL` nếu bộ đầy
đủ phát hiện lỗi mà selector bỏ sót. Receipt thiếu hoặc khác đầu vào được ghi
`NOT_VERIFIED`. Kết quả quan sát không được dùng làm required check.

Đối chiếu YAML với P1 xác nhận trigger, `system-artifact-access` và
`postgresql-migrations` giữ nguyên. So sánh 256 tổ hợp nhóm của release runner
xác nhận lệnh mặc định giữ nguyên. Hai chế độ quan sát thêm tham số ghi nhận
vào đúng lệnh pytest của nhóm Python, giữ đủ năm bước kiểm tra trước đó. Hai
bài kiểm tra cấu hình CI được cập nhật để kiểm tra chính xác lệnh full có
telemetry và quyền tải artifact của hai job mới. Các assertion hành vi và
deadline được giữ nguyên.

Các đối chứng sau chạy trên bản export P1 cô lập với CPython 3.14.4, Node
26.12.1, Chromium r1248, PostgreSQL 18.6 và toolchain RTL đã khóa. Mỗi gate gốc
đạt ở bản sạch và thất bại với thay đổi được nêu, dùng assertions hiện có.

| Đối chứng | Phản ứng gate |
| --- | --- |
| SHA-256 Contracts sai | Installer từ chối wheel dù vẫn là đúng file đã phát hành. |
| OpenAPI không đồng bộ | `export_openapi.py --check` phát hiện tiêu đề FastAPI bị đổi. |
| SDK công khai xuất ký hiệu riêng | Kiểm tra gói SDK phát hiện `InstrumentationExecutionPlan` trong payload. |
| Trường RPC khác schema | Kiểm tra biên dịch v2 phát hiện `Target.experiment_id` bị đổi tên. |
| Lease hết hạn không hủy phiên | Assertion timeout trong ca dọn trạng thái an toàn thất bại. |
| Dùng kiểm tra SAFE cũ sau cấp điện | Ca Hardware kiểm tra SAFE sau khi vào `ARMED` thất bại với driver kiểm thử. |
| Bỏ khóa giao dịch PostgreSQL | Cả hai ca writer race trên PostgreSQL 18.6 báo writer không đợi giao dịch giữ khóa. |
| RTL bỏ kiểm tra permit | `tb_lab_first_control.v` báo đầu ra không tắt khi mất routing permit. |
| Chromium thiếu WebGL | Ca technical grid báo lỗi tạo context và không đạt `data-ready='true'`. |

### Kết quả chạy song song

Ubuntu 24.04, CPython 3.14.6, Node 26.12.1, npm 11.19.1 và pytest 9.1.1.
Hai lượt dùng cùng ứng viên thử nghiệm `2ece3e9647917b959f495c72e8253a3e0201664e`,
với một comment ở endpoint health để kích hoạt rule hẹp. Hai venv, SQLite,
captures và CPU affinity được tách riêng. Cả hai thu thập đúng 1.740 case ID
và dùng cùng artifact đã xác minh, cùng payload API và cùng 71 phiên bản gói
Python đã cài.

| Lượt | Kết quả |
| --- | --- |
| `--observe-pytest full` | PASS đủ sáu lệnh trong 293,3 giây, 1.597 ca đạt và 143 skip launcher trên Ubuntu. |
| `--observe-pytest selected` | PASS đủ sáu lệnh trong 150,5 giây, 505 ca đạt, gồm 492 ca API và 13 ca baseline tài liệu/repository. 1.235 ca được bỏ chọn trong lượt quan sát. |
| So sánh receipt | PASS, không khác case ID đã thu thập, đầu vào hoặc kết quả ca đã chọn. Sửa bản sao của receipt thật để mô phỏng lỗi ngoài tập chọn cho `FAIL`. Đổi phiên bản dependency hoặc SHA ứng viên cho `NOT_VERIFIED`. |
| Kiểm tra bổ sung | PASS 64 ca P2 trên Windows, 5 ca Node về allocator/artifact, Actionlint 1.7.12 trên 8 workflow Remote và kiểm tra Markdown/context. |

Lượt thử ban đầu dùng chung quota bốn CPU và gặp timeout ở ca khóa stop. Ca
đó đạt ba lần khi chạy riêng và đạt ở cả hai lượt cuối, giữ nguyên deadline.
Lượt thử đầu cũng phát hiện `egg-info` từ checkout che metadata wheel trong
pytest. Hồi quy mới xác nhận receipt chỉ đọc metadata từ môi trường đã cài.
Các số thời gian là phép đo cục bộ cho một thay đổi thử. Chưa đo tác động
trên runner GitHub.

## 8. Triển khai P3

Contracts nhận 12 ca về parser số worker và một ca về protobuf presence.
Đối chiếu AST giữ nguyên thân hàm và tham số sau khi chuẩn hóa đường import
và fixture binding. Hardware giữ các ca số worker cấu hình thực tế, Stop
khi hàng đợi bận, hai route gRPC, driver boundary và alias tương thích.

Ma trận schema/profile ở Contracts vẫn có đúng 22 case ID của hai bộ cũ.
Remote giữ vòng lặp conformance 51 tình huống chạy trên wheel đã cài và thêm
kiểm tra SHA-256 của corpus cùng ba schema đã duyệt. So sánh chỉ chuẩn hóa
CRLF. Kiểm tra nguồn cài, registry, HTTP và gRPC vẫn kiểm tra sản phẩm đã chọn.
Hardware sở hữu kiểm tra raw NCAP với hai ca 100.000 mẫu. Remote giữ cùng
case ID để kiểm tra gateway công khai qua gRPC thật, gồm giải mã toàn bộ mẫu,
duration và hai ca descriptor có số đếm dạng boolean. Probe compiler →
gateway → RPC tiếp tục nằm ở Remote.

Interface có runner Chromium riêng cho Web Locks và renderer. Test Web Locks
dùng cùng helper contention với ca tích hợp, còn ca tích hợp vẫn xác nhận
principal từ API và kết nối WebSocket. Renderer dùng cùng spec, DPR, timeout,
assertions, baseline và tùy chọn Chromium. Runner nền tảng dùng loopback port
riêng và Vite chạy fixture, không cần API, Hardware hay Simulator. Browser
release và Browser tích hợp giữ nguyên bộ ca; runner riêng được xác minh
song song trước khi xem xét giảm lượt chạy. Mặc định Browser tích hợp vẫn
dùng một worker và retry 0.

So sánh selector giữ quyết định ban đầu để điều tra. Nếu bộ đầy đủ phát hiện
lỗi mà selector bỏ qua, skip hoặc ghi expected failure, receipt ghi `FAIL`
và đặt phạm vi hiệu lực thành full cho đúng ứng viên. Receipt thiếu hoặc
lệch provenance vẫn ghi `NOT_VERIFIED` với phạm vi full. Công tắc cấu hình
`CIRNET_CI_SELECTOR_FORCE_FULL=true` cho phép các lượt quan sát tiếp theo
chạy full trong khi xem lại rule. Job full và các gate an toàn chạy độc lập.

Các bản sao helper `build_ci_dependency.py` của Hardware và Simulator vẫn có
kiểm thử trực tiếp trong từng repo. Chưa có chứng cứ về toàn bộ caller bên
ngoài, nên P3 giữ helper và lịch chạy hiện có.

### Kiểm chứng theo ranh giới

| Phép kiểm tra | Kết quả |
| --- | --- |
| Contracts owner | PASS 529 ca. Collection tăng từ 516 lên 529, đúng 13 case ID mới, gồm cả các kiểm tra public SDK, wheel/sdist và probe cài cô lập. |
| Hardware trên wheel cài cô lập | PASS 126/126 trước chuyển và 113/113 sau chuyển. Hợp với 13 case ID chuyển sang Contracts khớp collection trước. Cả tám ca raw NCAP và ca Stop khi RPC bận đều đạt. |
| Byte của wheel trước và sau | Contracts trùng SHA-256 `ca4d89e7c093924603bb24165ae3bbe5c6c6e0b0626ca326ca88be64909bcf91`. Hardware trùng SHA-256 `7531e71d223393cb196efe6dfc977547822283f60217583d7dae075b1fc9953b`. |
| Resource từ wheel đã cài | Contracts giữ 22/22 case ID. Remote đạt hai ca parity và 35 ca registry, HTTP, RPC và nhận dạng wheel. Tài nguyên thiếu, corpus cũ và schema yếu hơn bị phát hiện. Khác biệt chỉ ở CRLF vẫn đạt. |
| Các đối chứng worker, protobuf và Stop | Thay default, chấp nhận zero, phá precedence canonical-empty, bỏ `optional` và bỏ phần dự trữ luồng RPC đều làm ca tương ứng thất bại trên export cô lập. |
| NCAP và instrument RPC | Cùng sáu case ID đạt trước và sau trên wheel phát hành. Bản sau cũng đạt trên Ubuntu với các wheel dựng từ nguồn CI đã khóa. Khi gateway trả thiếu mẫu trong bản export, cả hai ca 100.000 mẫu đều thất bại đúng assertion. |
| Browser tích hợp | Chromium r1248 thu thập 58 ca trong 17 spec. Ca Web Locks dùng API/RPC thật đạt trong 9,0 giây và đạt lại trong 9,3 giây với launcher cuối. Cả hai lượt có yêu cầu auth session và shutdown sạch. |
| Browser platform | PASS 9 ca, một ca capture lịch sử opt-in được skip như cấu hình gốc. Ubuntu, Chromium r1248, Node 26.12.1 và quota bốn CPU. Wall 11,8 phút. DPR 1 đạt trong 136,669 giây và DPR 2 trong 298,936 giây với deadline gốc 360 giây. Mỗi ma trận có 30 tư thế và không có pixel rò. |
| Launcher platform cuối | Web Locks và sáu tư thế QUAD DPR 2 đạt trên phiên riêng. Ba biến đầu ra cố ý trỏ sai vị trí vẫn ghi last-run JSON, Blob ZIP và Perfetto JSON vào thư mục do allocator cấp. Bỏ khóa trong ledger làm hàng đợi trả 0 thay vì 2. Tắt WebGL làm ca renderer không đạt readiness gốc. Cả hai bản tiêm lỗi được khôi phục từng byte. |
| Interface product | PASS AST, 34 ca script, 1.500 ca runtime, kiểm tra kiểu E2E và production build trên bản nguồn Interface cuối. |
| Bộ Python Remote đầy đủ | PASS cả sáu lệnh trong 306,4 giây trên Ubuntu 24.04 và CPython 3.14.6 với ba wheel dựng từ đúng nguồn CI đã khóa. 1.585 ca đạt, 143 skip launcher trên Ubuntu và một cảnh báo deprecation Starlette. |
| Selector và workflow | PASS 81 ca selector, policy và release runner. Đối chứng chạy CLI trả exit 1 và ghi phạm vi `full` khi bỏ sót một lỗi. Actionlint 1.7.12 đạt trên 13 workflow. So sánh YAML xác nhận job build/export Interface và các gate Remote hiện hành giữ cấu hình tương đương. |
