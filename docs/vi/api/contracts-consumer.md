# Hướng dẫn dùng Contracts trong Remote

[English](../../en/api/contracts-consumer.md) · [README gốc của consumer](../../../contracts/README.md)

Repo độc lập [cirnet-contracts](https://github.com/cirnetlab/cirnet-contracts) sở hữu Contracts chuẩn và Device Library. Hệ thống **0.1.4** chọn Interface **0.1.4** cùng API, Contracts, Simulator, Hardware và FPGA **0.1.2**. Gói Python là `cirnet-contracts==0.1.2`, nhập dưới tên `contracts`. Interface dùng `@cirnet/contracts` **0.1.2**. Bộ cấp phát DEV độc lập dùng phiên bản Python **1.0.0a1** và npm **1.0.0-m1.0**. [Manifest hệ thống](../../../integration/release-set.json) ghi revision của producer, tên tệp và mã băm SHA-256 chính xác.

JSON Schema định nghĩa cấu trúc, đăng ký FastAPI trong Remote định nghĩa thao tác công khai, và protobuf định nghĩa trường RPC cục bộ. Manifest đã cài ghi phiên bản, phạm vi hiển thị, producer, consumer, profile, artifact và chính sách tương thích. URI lược đồ tuyệt đối phân giải ngoại tuyến từ tài nguyên đã cài, độc lập với thư mục làm việc. Registry đọc được định danh tương đối cũ. `contracts/__init__.py` của Remote chuyển việc nạp module, spec và tài nguyên đến wheel đã cài. Thiếu Contracts, sai phiên bản hoặc cài editable đều báo lỗi.

## Chuẩn bị artifact đã chọn

Các gói runtime Contracts hỗ trợ Python 3.11+. CI chính cho sinh mã và kiểm chứng dùng Python 3.14 và Node 26. Bắt đầu bằng venv mới ngoài Git. Để cài đúng bộ phát hành, chạy `python -B scripts/install_release.py --manifest integration/release-set.json --environment-file release-env.json` rồi nạp cả hai khối biến môi trường mà installer trả về. Xem [hướng dẫn phát hành](../../../deployment/multi-repo-release.md).

Khi phát triển mã nguồn API, dùng manifest tuyệt đối đã duyệt cho từng producer với đường dẫn và mã băm. Manifest Contracts cung cấp artifact Python, npm và wheel của bộ cấp phát DEV. Ví dụ shell dưới đây cài wheel producer trước API editable và cấp thư mục đầu ra ngoài Git cho các kiểm tra tiếp theo. Nếu dùng nhiều checkout, đưa tất cả Git root tham gia vào artifact context trước khi cấp phiên.

```sh
export CIRNET_CONTRACTS_ARTIFACT_MANIFEST=/absolute/reviewed/artifacts.json
python -B scripts/install_contracts.py --with-dev --manifest "$CIRNET_CONTRACTS_ARTIFACT_MANIFEST"
CIRNET_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)" || exit 1
export CIRNET_ARTIFACTS_SESSION
mkdir -p "$CIRNET_ARTIFACTS_SESSION/tmp" "$CIRNET_ARTIFACTS_SESSION/pip-cache"
export TMP="$CIRNET_ARTIFACTS_SESSION/tmp" TEMP="$CIRNET_ARTIFACTS_SESSION/tmp" TMPDIR="$CIRNET_ARTIFACTS_SESSION/tmp"
export PIP_CACHE_DIR="$CIRNET_ARTIFACTS_SESSION/pip-cache" PYTHONDONTWRITEBYTECODE=1
export CIRNET_SIMULATOR_ARTIFACT_MANIFEST=/absolute/reviewed/simulator-artifacts.json
python -B scripts/install_simulator.py
export CIRNET_HARDWARE_ARTIFACT_MANIFEST=/absolute/reviewed/hardware-artifacts.json
python -B scripts/install_hardware.py
python -B -m pip install -r requirements-verification.txt -e './services/api[test]'
export CIRNET_FPGA_ARTIFACT_MANIFEST=/absolute/reviewed/fpga-artifacts.json
fpga_install="$(python -B scripts/install_fpga.py --manifest "$CIRNET_FPGA_ARTIFACT_MANIFEST")" || exit 1
CIRNET_FPGA_ROOT="$(printf '%s' "$fpga_install" | python -B -c 'import json,sys; print(json.load(sys.stdin)["fpgaRoot"])')" || exit 1
export CIRNET_FPGA_ROOT
```

`--with-dev` khởi tạo bộ cấp phát và cài Contracts. `--dev-only` chỉ chuẩn bị bộ cấp phát. Lệnh cài Simulator và Hardware nhận `--manifest` hoặc biến môi trường tương ứng ở trên. Installer FPGA nhận `--manifest` và trả `fpgaRoot` trỏ đến thư mục giải nén mới thuộc phiên. Trong PowerShell, đọc JSON bằng `ConvertFrom-Json` rồi gán `fpgaRoot` cho `$env:CIRNET_FPGA_ROOT`. Giữ manifest, thư mục gốc và phiên cho các kiểm tra con. Sản phẩm FPGA chịu trách nhiệm nghiệm thu RTL thật bằng parser, bộ mô phỏng đã khóa phiên bản và Contracts đã cài. Remote kiểm tra scaffold đã chọn dưới dạng archive và không cài FPGA như phụ thuộc Python.

Interface sở hữu thiết lập Web, gồm khởi tạo SDK và DEV trước khi cài npm theo lock. Dùng [hướng dẫn Interface đã chọn](https://github.com/cirnetlab/cirnet-interface/blob/f1fe0c4738e105727aff1a331327caf7172cdf5f/README.md). Đặt `CIRNET_INTERFACE_ROOT` trỏ đến sản phẩm đã chuẩn bị cho các bước Web và browser. Trình chạy phát hành cũng nhận `--interface-root` tuyệt đối. Simulator và Hardware sở hữu build và kiểm thử đơn vị riêng. Pin Simulator, Hardware, FPGA và SDK/sdist thử nghiệm 0.1.1 thuộc các bộ cũ. Giữ định danh đó khi đọc [biên bản chuyển đổi M2](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers/plans/2026-10-24-multi-repo-migration-m2.md) và cây mã lịch sử của producer trong Git.

## Kiểm chứng phía consumer

Chạy từ thư mục gốc Remote với manifest đã chọn và phiên đầu ra thuộc quyền quản lý. Xuất OpenAPI đọc đăng ký mà không khởi động dịch vụ. Việc sinh Contracts chuẩn nằm ở producer độc lập.

```sh
python -B -m scripts.check_contract_consumer
python -B scripts/generate_contracts.py --check
python -B scripts/export_openapi.py --check
python -B scripts/check_contract_sdk.py
python -B scripts/check_contract_package.py
python -B scripts/check_release.py --group contracts
```

`sync_lab_contracts.py --check` và các wrapper sinh mã, catalog đối chiếu bản chiếu đã cài. Lệnh xuất có ghi dùng thư mục ngoài Git. Remote đóng gói metapackage rỗng `cirnet-remote-dev`. Producer Contracts giữ việc sinh UTF-8/LF xác định, công cụ đã khóa, công bố theo bước và quay lui khi lỗi I/O thông thường. Chế độ sinh từ source độc lập và từ tài nguyên đã cài được kiểm riêng.

Wheel đã chọn cung cấp model Python, binding RPC và tài nguyên được sinh. Tarball npm đã chọn cung cấp DTO, validator, catalog và fixture công khai. Interface bổ sung phần tài nguyên chỉ dùng cho kiểm thử từ sdist Contracts có danh sách cho phép và đã xác minh digest. Consumer SDK của Remote kiểm tarball npm thật về tương đương khi chạy, kiểu và phạm vi public đã đóng gói. Interface sở hữu adapter ứng dụng và facade `src/types`. Bản xuất trình duyệt bỏ `InstrumentationExecutionPlan` và `StationCapabilities` riêng tư. Khả năng công khai bỏ tài nguyên định tuyến. Xuất OpenAPI đã duyệt từ đăng ký API, sinh mã bên Contracts, rồi yêu cầu bản xuất Remote trên wheel cuối khớp. Thuộc tính mở và metadata là điểm mở rộng có chủ đích.

## Profile, giao thức và chẩn đoán

Profile cấu trúc, editor và transport có phiên bản riêng. Lưu trữ cấu trúc giữ số đồ thị cũ với độ chính xác tùy ý. Trình duyệt kiểm token số gốc và từ chối mất độ chính xác trước khi chuyển đổi. Chuẩn hóa bí danh thuộc tính cũ là một thao tác tài liệu riêng. Transport áp cả giới hạn số nguyên an toàn của JavaScript và giới hạn uint32 của protobuf trước khi tuần tự hóa RPC. Giá trị vượt giới hạn bị từ chối mà không bị thay đổi. `timestamp_ns` theo epoch vẫn là chuỗi thập phân. Đọc [profile đã chọn](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/profiles.json) cùng [bản chụp profile lịch sử](https://github.com/cirnetlab/cirnet-remote/blob/989954f95c1c6b1d224e31a53fb33f125f0a81a9/contracts/profiles.json).

Pydantic và TypeScript biểu diễn cấu trúc. Trình kiểm JSON Schema ngoại tuyến đầy đủ thực thi phép kết hợp, tham chiếu, điều kiện, giới hạn mảng và số, mẫu chuỗi, luật lắp `if/not` và quan hệ giữa các trường. Trình sinh từ chối từ vựng chưa biết và tham chiếu riêng tư hoặc không phân giải được. Adapter biên Python giữ cách biểu diễn số đầu vào và việc trường có bị bỏ qua hay không. Tuyến API dùng `response_model_exclude_unset=True` khi tuần tự hóa.

`fixtures/conformance.json` trong wheel cung cấp mã quy tắc và ca công khai dùng chung cho Python và trình duyệt. Python cũng chạy ca nội bộ rõ ràng. Soạn thảo, thực thi máy chủ, bằng chứng vật lý quan sát được và an toàn điện là các ngữ cảnh riêng. Kiểm hợp đồng không cấp quyền cấp điện, xác nhận đường vật lý hoặc bật thiết bị chưa khả dụng.

Metadata thao tác WC20 gắn các trạng thái và media type được ghi với phản hồi chuẩn, gồm lỗi và 422 kiểm dữ liệu cũ. Biên trình duyệt từ chối trạng thái thành công không được ghi, lỗi sai định dạng và media nhị phân không khớp. Các điểm neo thao tác cũ vẫn được giữ. Giới hạn trước phân tích yêu cầu trả ErrorEnvelope HTTP 400 đã ghi.

Entrypoint sinh `validators*.core` phục vụ editor đồng bộ, thuộc tính đã soạn, cấu hình cục bộ và xác thực. Luồng API và realtime chuẩn bị profile ngoại tuyến đầy đủ trước khi dùng. `parseStructural` chạy đồng bộ và báo lỗi an toàn nếu validator cần thiết chưa chuẩn bị. Profile đầy đủ dùng import trì hoãn với đường dẫn xác định để nạp validator đã sinh, không biên dịch lúc chạy hoặc phân giải lược đồ qua mạng. Cả bản core và bản đầy đủ được sinh xác định, có kiểm tra tương đương và luồng khởi tạo lạnh. Fixture đơn vị chuẩn bị profile khi gọi controller đồng bộ trực tiếp. Ca khởi tạo lạnh và browser thật kiểm quá trình nạp thực tế.

`fixtures/diagnostics.json` bổ sung yêu cầu về mã quy tắc, JSON Pointer và profile. Lỗi Pydantic đã sinh mang thông tin chuẩn đã lọc. HTTP thêm tiền tố vị trí yêu cầu như `/body/name` mà không lặp giá trị đầu vào hoặc mở rộng envelope cấp cao nhất đã chốt.

## Nguồn gốc và kiểm thử gói đã cài

`compatibility/2026-10-16` trong wheel lưu Git blob chính xác và revision nguồn cho schema và RPC trước W1 đã được hỗ trợ nhưng chưa phát hành. `public-wire-baseline.json` chốt điểm neo thao tác, request, response, bảo mật, schema có tên và bố cục NCAP của API chưa phát hành được hỗ trợ. `python -B scripts/check_public_compatibility.py` từ chối thay đổi điểm neo. Kiểm thử có ca cố ý thay đổi để xác nhận việc từ chối. Thao tác mới và định nghĩa có phiên bản có thể cùng tồn tại. Baseline cần được duyệt rõ ràng. Digest thô từ checkout Windows vẫn được giữ, và đối chiếu chỉ chuẩn hóa CRLF thành LF. Các fixture này là bằng chứng lịch sử, tách khỏi tuyên bố phát hành.

Wheel cung cấp cùng byte baseline trên Windows và Linux. Graph 1.0 và 1.1 giữ các lược đồ đã chốt. Namespace trình bày mới cần chọn rõ ràng và giữ metadata lạ hoặc thuộc phiên bản tương lai. Thay đổi làm vỡ cấu trúc công khai cần phiên bản mới và migration đã thử. DTO gốc kiểu boolean có tên và việc di chuyển tham chiếu động gây lỗi sinh mã. Schema boolean lồng nhau và ràng buộc runtime JSON Schema 2020-12 đầy đủ được hỗ trợ.

Wheel đóng gói schema, dữ liệu, baseline, fixture và proto, đồng thời sinh binding RPC lúc build. Runtime lõi khóa phụ thuộc JSON Schema, referencing và Pydantic. Extra `[rpc]` cung cấp phụ thuộc để nhập RPC cục bộ. API và Hardware khóa grpcio và protobuf cùng phiên bản với trình sinh. FastAPI và Pydantic được khóa để xuất thao tác xác định. `requirements-verification.txt` có phụ thuộc giám sát tải tùy chọn dùng trong hồi quy dọn tiến trình thuộc phiên.

`check_contract_package.py` dựng wheel API rồi kết hợp với wheel Contracts, Simulator và Hardware đã chọn. Probe cô lập `-I`, venv và thư mục làm việc nằm ngoài Git. Bước này kiểm nguồn import, tài nguyên đóng gói, bảo toàn đồ thị, NCAP v1/v2, điều phối miền, giới hạn RPC, migration head, lưu xác thực/dự án/capture và CLI đã cài. Định danh catalog đến từ wheel đã cài. Log build nằm trong phiên ngoài Git dùng chung và dọn dẹp chỉ xóa thư mục con thuộc phiên. Wrapper Node và Python dùng cùng bộ cấp phát DEV đã khóa. Xem [kiểm chứng và artifact](../contributing/verification.md).

## Các nhóm kiểm tra phát hành

`python -B scripts/check_release.py --show-plan` liệt kê lệnh chính xác. Khi lập kế hoạch, công cụ có thể cấp thư mục pytest ngoài Git. Lặp `--group` để chọn một tập con.

| Nhóm | Phạm vi |
| --- | --- |
| `contracts` | Context, nguồn gốc gói đã cài, FPGA đã chọn, bản chiếu, OpenAPI, tương thích công khai và artifact npm thật. Chạy pytest Contracts khi thiếu nhóm Python đầy đủ. |
| `python` | Toàn bộ suite Python, cùng các bước kiểm nguồn gốc cần thiết. |
| `web` | Ranh giới module, kiểm thử đơn vị và build Interface đã chọn. |
| `postgres` | Migration thật, sao lưu/khôi phục và ca ghi từ các kết nối độc lập. Đặt `CIRNET_TEST_POSTGRES_URL` trỏ đến cơ sở dữ liệu dùng một lần và chuẩn bị công cụ client PostgreSQL 18 tương ứng. |
| `browser` | Kịch bản Remote và Interface thật. Chuẩn bị cache Chromium đã khóa và sản phẩm Interface đã chọn. |
| `package` | Kiểm gói consumer cài sạch với vùng làm việc tạm ngoài Git thuộc phiên. |
| `all` | Sáu nhóm bắt buộc trên. Kế hoạch gộp chạy suite Python đầy đủ một lần. |

Các target Make giữ các nhóm này. Lệnh tùy chọn `python -B scripts/check_release.py --group load` chạy 50 phiên cookie/CSRF, đồng thời 10, tám capture ảo thật và ba lượt đọc, vẫn áp giới hạn xác thực. Nhóm này nằm ngoài `all` và gate PR thông thường. JSON thô đi vào `web-sessions/report.json` ngoài Git. Khi dùng trực tiếp `scripts/benchmark_web_sessions.py --output`, đường dẫn phải là tệp tuyệt đối ngoài Git đã được kiểm. Ghi kịch bản, môi trường và kết quả vào biên bản kiểm chứng rồi chỉ dọn phiên thuộc quyền quản lý. Số liệu ngày 2026-10-16 mô tả các lượt đo cục bộ đã ghi. Năng lực production và phần cứng vật lý cần bằng chứng riêng.
