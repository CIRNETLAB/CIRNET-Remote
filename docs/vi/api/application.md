# API ứng dụng và cách chạy dịch vụ cục bộ

[English](../../en/api/application.md) · [Kiến trúc hệ thống](../architecture/system.md) · [Gói API Python](../../../services/api/README.md)

Remote dùng FastAPI dạng monolith mô-đun để xác thực, quản lý phiên bản dự án và mạch, công bố bài tập, quản lý thí nghiệm, điều phối và lưu bản thu. Hardware Service chạy riêng để điều khiển trạm và giao tiếp FPGA. API gọi dịch vụ này qua RPC `2.0` nội bộ. Chỉ chạy một tiến trình API điều phối. Production cần PostgreSQL, khai báo origin HTTPS cụ thể và tắt chế độ khách. [Xác thực và migration](../architecture/auth-and-migrations.md) · [Triển khai production](../operations/deployment.md)

## Chọn và khởi động dịch vụ

[Khóa bản phát hành](../../../integration/release-set.json) chọn hệ thống và Interface `0.1.4`, API, Contracts, Simulator, Hardware và khung FPGA `0.1.2`, cùng công cụ DEV khóa riêng. [Quy trình cài từ gói phát hành](../../../deployment/multi-repo-release.md) cài đúng phiên bản và digest vào môi trường mới. Production chạy các gói đã cài. Trình khởi chạy Windows dùng API từ checkout qua `--app-dir services/api`, mô-đun Hardware đã cài và Interface đã giải nén. Môi trường kiểm chứng mã nguồn dùng Python 3.14 và Node 26. Gói API hỗ trợ Python từ 3.11. [Trình khởi chạy Windows](../../../README.md) · [Cài đặt Interface đã chọn](https://github.com/cirnetlab/cirnet-interface/blob/f1fe0c4738e105727aff1a331327caf7172cdf5f/README.md)

Để chạy phát triển thủ công trên POSIX, chuẩn bị môi trường ảo bên ngoài kho với các wheel Contracts, Simulator, Hardware đã duyệt và các gói API cần. [Hướng dẫn cho bên tiêu thụ Contracts](contracts-consumer.md) liệt kê các lệnh cài. Dùng tệp khóa để chọn phiên bản hiện tại. Đặt `CIRNET_ARTIFACTS_SESSION` thành phiên ngoài kho do mình sở hữu và `CIRNET_API_PYTHON` thành trình thông dịch đã chuẩn bị. Trong cả hai terminal dịch vụ, từ thư mục gốc Remote, chọn trạng thái cục bộ cách ly, dùng cùng backend và số tiến trình mô phỏng.

```sh
export CIRNET_ENV=development
export CIRNET_DATABASE_URL="sqlite:///${CIRNET_ARTIFACTS_SESSION}/local.sqlite"
export CIRNET_CAPTURE_DIR="${CIRNET_ARTIFACTS_SESSION}/captures"
export CIRNET_SIMULATION_BACKEND=legacy
export CIRNET_SIMULATION_WORKERS=4
```

Khởi động mỗi dịch vụ trong một terminal riêng.

```sh
# Terminal 1, from Remote root
"$CIRNET_API_PYTHON" -m hardware_service.server 127.0.0.1:50051

# Terminal 2, from Remote root
"$CIRNET_API_PYTHON" -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000

# Terminal 3, from the prepared Interface product
npm run dev
```

Vite chỉ chạy dịch vụ Web và chuyển tiếp `/api`, `/ws` đến API. Dùng origin Vite in ra, thường là `http://127.0.0.1:5173`. Kiểm tra `GET /api/health` trực tiếp trên cổng `8000` và qua Vite. Cặp API/Contracts đã chọn trả định danh `cirnet-api`. Health xác nhận dịch vụ HTTP phản hồi. Dùng `GET /api/stations` với phiên đã xác thực hoặc phiên khách phát triển được bật để kiểm tra tìm trạm. Trạm mô phỏng cục bộ có ID `virtual-station-01`. Trạng thái phần cứng không khả dụng được báo riêng với HTTP health.

## Hợp đồng HTTP và thời gian thực

[Tài liệu REST sinh từ phiên bản Contracts đã chọn](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/api/README.md) đặc tả DTO và thao tác. [Đăng ký route FastAPI](../../../services/api/app/api) là nguồn triển khai. Các thao tác `/api/v2` cho tài liệu, kiểm tra, xem trước, tạo thí nghiệm và bài tập hỗ trợ Graph 1.2 song song với các thao tác cũ.

| Công việc | Thao tác ví dụ |
| --- | --- |
| Khởi tạo hoặc đổi phiên | `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/claim-guest` |
| Kiểm tra hoặc xem trước mạch | `POST /api/circuits/validate`, `POST /api/circuits/physical-preview` hoặc route `/api/v2/circuits/…` tương ứng |
| Đọc thông tin trạm | `GET /api/stations`, `GET /api/stations/{station_id}/capabilities`, `GET /api/stations/{station_id}/queue` |
| Lưu phiên bản mạch thuộc sở hữu | `GET /api/circuits/{document_id}`, sau đó `PUT /api/circuits/{document_id}` với `base_revision` trong thân JSON, hoặc dùng route `/api/v2/circuits/…` tương ứng. Cả hai phiên bản trả `ETag`. |
| Đọc bài tập đã công bố | `GET /api/assignments`, `GET /api/assignments/{assignment_id}` |
| Tạo, chạy và dừng thí nghiệm | `POST /api/experiments`, `POST /api/experiments/{experiment_id}/run`, `POST /api/experiments/{experiment_id}/stop` |
| Đối soát kết quả | `GET /api/operations/{operation_key}`, `GET /api/experiments/history`, `GET /api/experiments/active`, `GET /api/experiments/{experiment_id}/results` |
| Đọc hoặc loại bỏ dữ liệu bản thu thô | `GET` hoặc `DELETE /api/captures/{capture_id}/payload` |
| Đăng ký luồng sự kiện trực tiếp có giới hạn | `WS /ws/events` |

API đã chọn cấp cookie phiên HttpOnly, SameSite=Lax mang tên `cirnet_session` và tên tương thích cũ `netcircuit_session`. Cookie production có cờ Secure. Cookie chuẩn được ưu tiên khi có mặt. `GET /api/auth/session` cung cấp `csrf_token`. Các phương thức không an toàn cần đúng Origin đã cấu hình và `X-CIRNET-CSRF`, kể cả đăng nhập và đăng xuất. `X-CSRF-Token` cũ được chấp nhận khi thiếu header chuẩn. `X-Request-ID` xác định phản hồi để tra chẩn đoán. HTTP, WebSocket và truy cập bản thu đều kiểm tra quyền theo vai trò và đối tượng.

Ví dụ, với phiên trình duyệt đã xác thực hoặc chế độ khách phát triển đã bật, chạy các yêu cầu đọc sau từ origin Interface.

```js
const session = await fetch('/api/auth/session')
if (!session.ok) throw new Error(`Session bootstrap failed (${session.status})`)
const stations = await fetch('/api/stations')
if (!stations.ok) throw new Error(`Station discovery failed (${stations.status})`)
const stationList = await stations.json()
```

Run cần `X-Control-Client`, định danh tab được gắn với phiên và không chứa bí mật xác thực. Create, Run và Stop hỗ trợ `Idempotency-Key` để đối soát kết quả đã lưu theo danh tính. Xác nhận Run ghi nhận yêu cầu đã được tiếp nhận hoặc bắt đầu chạy. Kết quả hoàn tất phép đo được báo riêng. Xác nhận Stop yêu cầu đã giải phóng an toàn. Đọc bản ghi thao tác hoặc lệnh khi mất phản hồi xác nhận. Kết nối lại và tải lại phục hồi quyền quan sát đã cấp, không phát lại thao tác ghi hay cấp quyền điều khiển. [Theo dõi kết quả đang chờ](../architecture/pending-observations.md)

## Ranh giới thiết bị đo và bản thu

`GET /api/experiments/{experiment_id}/instruments/access` báo quyền truy cập theo phân bổ thiết bị. Route Generator có kiểu `POST /api/experiments/{experiment_id}/instruments/generator` yêu cầu `X-Control-Client` và `Idempotency-Key`. Đọc bản ghi tại `GET /api/experiments/{experiment_id}/instruments/commands/{operation_key}`. `ACCEPTED` và áp dụng trên phần cứng là hai trạng thái riêng. Thay đổi khi chạy cần quyền giữ trạm ở `RUNNING`, quyền điều khiển đang hiệu lực, kênh được phân bổ, hỗ trợ khi chạy đã công bố, kết quả an toàn mới và giới hạn theo cấu hình. Scope và Generator có 0 kênh ở cấu hình cơ sở. Trạm và máy chủ tự thực thi giới hạn và an toàn, độc lập với giao diện. [An toàn phòng thí nghiệm vật lý](../architecture/physical-lab-safety.md)

JSON thí nghiệm và `experiment.updated` mang `CaptureMetadata`. Endpoint nội dung giới hạn dữ liệu NCAP v1 nhị phân theo quyền sở hữu và kiểm tra lại quyền sau khi đọc chậm. Sao lưu `CIRNET_CAPTURE_DIR` cùng cơ sở dữ liệu bền vững. Stop giữ các bản thu trước. Loại bỏ dữ liệu cũ qua danh mục bản thu có nhật ký và chính sách bảo trì. Codec NCAP v2 hỗ trợ định dạng lấy mẫu, còn bản thu khi chạy dùng NCAP v1. [Danh mục bản thu](../architecture/capture-catalog.md)

## Kiểm chứng môi trường đã chọn

Chạy `python -B scripts/generate_hardware_rpc.py --check` để kiểm tra binding Contracts đã cài và `python -B scripts/export_openapi.py --check` để đối chiếu route xuất ra với hợp đồng đã chọn. Chạy `node scripts/e2e-interface.mjs --interface-root ABSOLUTE_PRODUCT --forbid-only` để kiểm chứng trình duyệt tích hợp bằng Interface đã chọn, với đầu ra ở phiên ngoài kho do mình sở hữu. Phân biệt Interface đã phát hành với [commit ứng viên trình duyệt của master](../../../integration/browser-interface-source.json). [Quy định kiểm chứng](../../en/history/verification-ledger.md)

[Báo cáo phát hành cục bộ 0.1.4](../../en/history/verification/2026-11-05-cirnet-release-0.1.4.md) ghi kết quả API và khởi động native lần đầu với đúng đầu vào của báo cáo. [Báo cáo kiểm tra hạ tầng kiểm thử](../history/verification/2026-11-05-test-infrastructure-audit.md) và [biên bản chuyển đổi native Giai đoạn 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md) mô tả các lần chạy và môi trường khác.
