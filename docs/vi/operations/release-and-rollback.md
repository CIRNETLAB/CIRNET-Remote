# Phát hành và khôi phục hệ thống

[English](../../en/operations/release-and-rollback.md) · [Mục lục](../index.md)

Dùng [khóa phát hành hệ thống](../../../integration/release-set.json). Hệ
thống và Interface dùng **0.1.4**. API, Contracts, Simulator, Hardware và mã
nguồn FPGA dùng **0.1.2**. Bộ cấp phát độc lập dùng bản Python **1.0.0a1** và
npm **1.0.0-m1.0**. Mỗi mục khóa xác định đúng tên tệp, SHA-256, revision
mã nguồn và URL tài sản phát hành GitHub dạng số.

## Chuẩn bị môi trường xác minh cô lập

Cài Git, Node.js 26 LTS và Python 3.14 trở lên. Kích hoạt venv ngoài repo.
Đặt `CIRNET_ARTIFACTS_TOKEN` riêng tư nếu cần xác thực. Tài sản công khai đã
phát hành cho phép tải ẩn danh. Xem [quyền tải artifact của CI](ci-artifact-access.md)
để biết phạm vi và cách đổi thông tin xác thực.

Chạy từ thư mục gốc Remote bằng PowerShell. Gọi trình cài một lần và giữ JSON
ở ngoài repo. Nạp cả hai khối môi trường vào shell cha. Trình cài chỉ chuẩn bị
các gói, chưa khởi động dịch vụ hay triển khai hệ thống.

```powershell
$releaseSummary = python -B scripts/install_release.py --manifest integration/release-set.json --environment-file release-env.json | ConvertFrom-Json -ErrorAction Stop
if ($LASTEXITCODE -ne 0) { throw 'Release installation failed; inspect its external diagnostics.' }
$releaseState = Get-Content -Raw -LiteralPath $releaseSummary.environmentFile -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
foreach ($block in @($releaseState.environment, $releaseState.processEnvironment)) {
  foreach ($property in $block.PSObject.Properties) {
    [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
  }
}
python -B -m pip install -r requirements-verification.txt
if ($LASTEXITCODE -ne 0) { throw 'Verification tooling installation failed.' }
$interfaceBootstrap = node "$env:CIRNET_INTERFACE_ROOT/scripts/bootstrap-contracts.mjs" --manifest "$env:CIRNET_CONTRACTS_ARTIFACT_MANIFEST" | ConvertFrom-Json -ErrorAction Stop
if ($LASTEXITCODE -ne 0) { throw 'Interface artifact bootstrap failed.' }
foreach ($property in $interfaceBootstrap.environment.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
}
npm --prefix "$env:CIRNET_INTERFACE_ROOT" ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Interface dependency installation failed.' }
npm --prefix "$env:CIRNET_INTERFACE_ROOT" run test:e2e:install
if ($LASTEXITCODE -ne 0) { throw 'Pinned browser installation failed.' }
python -B -m pip check
if ($LASTEXITCODE -ne 0) { throw 'The selected package set is inconsistent.' }
```

Lệnh đầu xác minh và cài các artifact đã chọn. Dependency xác minh và cài
trình duyệt là bước riêng. Trình quản lý gói kế thừa đường dẫn cache và thư
mục tạm ngoài repo. Cache cài trình duyệt thuộc bản xuất Interface ngoài repo.
Mỗi lần khởi chạy trình duyệt thật dùng một bản sao riêng đã cấp quyền sở hữu.
Đặt `CIRNET_TEST_POSTGRES_URL` cho PostgreSQL thật, cô lập và
`CIRNET_TEST_PG_BIN` cho các công cụ sao lưu và khôi phục tương ứng.

```text
python -B scripts/check_release.py --show-plan
python -B scripts/check_release.py --group contracts --group python --group web --group postgres --group browser --group package
```

Gate Browser khởi động và dừng API/RPC thật và kiểm tra khởi động lại. Dùng
cấu hình một worker, retry bằng 0 và forbid-only. FPGA sở hữu parser, compiler
và runtime đã khóa riêng, cùng cả hai testbench RTL hành vi. Kết quả dựng mã
nguồn chưa đủ để nghiệm thu Browser thật, RTL hay phần cứng.

## Xác minh bộ ứng viên cục bộ

Dùng manifest riêng có `distribution: "local"`, sáu revision mã nguồn chính
xác, yêu cầu tương thích và chính sách sao lưu. Mỗi artifact có tên tệp mang
phiên bản, `path` tuyệt đối đến tệp thông thường và SHA-256. Mục cục bộ bỏ
`url`. Trình cài kiểm tra toàn bộ lựa chọn trước khi thiết lập và xác minh
lại byte khi sao chép. Giữ manifest và artifact ngoài Git. Khóa phát hành công
khai tiếp tục trỏ đến bản phát hành bất biến.

```text
python -B scripts/install_release.py --local-artifacts --manifest ABSOLUTE_LOCAL_RELEASE_MANIFEST --environment-file release-env.json
```

Nạp cả hai khối môi trường và chuẩn bị công cụ xác minh như trên. Ghi riêng
phần thay đổi công cụ xác minh chưa commit và đầu vào sản phẩm đã commit.
Để chạy smoke cục bộ trên Windows, đặt `CIRNET_RELEASE_MANIFEST` thành đường
dẫn tuyệt đối đến manifest cục bộ và dùng `CIRNET_DEV_HOME` riêng.

## Phát hành và vận hành bộ đã chọn

Dùng tên `<project>-v<version>` và tag `v<version>`. Contracts, Simulator,
Hardware và FPGA dùng `v0.1.2`. Interface và hệ thống Remote dùng `v0.1.4`.
Bản phát hành Remote chứa artifact API 0.1.2 và manifest hệ thống. Xác minh
toàn bộ bộ cục bộ, chỉ tải các byte đã xác minh lên draft mới, rồi kiểm tra
danh tính và digest trước khi phát hành. Tag và byte đã phát hành giữ nguyên
danh tính gốc.

Khi được phép cài trên môi trường sản xuất, dùng hai môi trường Python riêng
cho API và Hardware. API cài wheel API, Contracts và Simulator đã chọn.
Hardware cài wheel Hardware, Contracts và Simulator đã chọn. Phục vụ đúng
gói tĩnh Interface với các route Nginx cùng origin hiện có là `/models`,
`/api` và `/ws`. Giữ một tiến trình lập lịch API và RPC Hardware trên
loopback. Môi trường sản xuất dùng các gói và bundle tĩnh đã xác minh. Các
khả năng phần cứng chưa xác minh vẫn ở trạng thái không khả dụng. Xem
[hướng dẫn triển khai](deployment.md) và
[kiểm tra Mini PC](mini-pc.md).

## Khôi phục phiên bản trước

Dừng tiếp nhận phiên mới và giữ một bộ gồm bản sao lưu cơ sở dữ liệu, kho
capture và manifest phát hành tương ứng. Xác nhận dọn dẹp an toàn hoặc duy trì
cách ly. Giữ lease và trạng thái cách ly khi chưa xác nhận dọn dẹp. Khôi phục
cơ sở dữ liệu và capture như một bộ. Kiểm tra quyền sở hữu, migration, hash
capture và cách ly trước khi khởi động. Tạo lại môi trường theo đúng bộ phát
hành tương ứng. Tránh phát lại lệnh chưa biết kết quả.

```text
python -B scripts/check_release_rollback.py --show-plan
python -B scripts/check_release_rollback.py --run --environment-file ABSOLUTE_INSTALLATION_STATE
python -B scripts/check_release_rollback.py --show-plan --local-artifacts --manifest ABSOLUTE_LOCAL_RELEASE_MANIFEST
python -B scripts/check_release_rollback.py --run --local-artifacts --environment-file ABSOLUTE_INSTALLATION_STATE
```

Dùng trạng thái kiểm thử cô lập. Công cụ gắn kết quả với digest manifest,
venv và đường dẫn đầu ra có quyền sở hữu. Gate phần mềm và phục hồi cần bằng
chứng riêng với diễn tập cài lại đầy đủ bộ artifact trước đó và phục hồi đúng
cặp cơ sở dữ liệu, capture. Khôi phục hệ thống thật hoặc nạp FPGA cần quyền
riêng. Xem [bằng chứng theo ngày](../history/index.md) để biết phạm vi từng
lần diễn tập.
