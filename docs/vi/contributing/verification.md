# Xác minh CIRNET Remote

[English](../../en/contributing/verification.md) · [Mục lục](../index.md)

## Xác lập quyền sở hữu đầu ra trước khi chạy

Tạo ảnh chụp, video, trace, báo cáo HTML, nhật ký và số đo thô bên ngoài mọi
checkout, worktree và thư mục quản trị Git ngay từ lần ghi đầu tiên. Dùng bộ
cấp phát DEV chung qua `scripts/artifact-paths.mjs` hoặc adapter Python
`scripts/artifact_paths.py`. Giữ nguyên tài sản nguồn và baseline đã duyệt.
Chỉ giữ bằng chứng xác minh dạng Markdown trong repo.

Cài Git, CPython 3.14 với GIL mặc định và Node.js 26. Đầu vào DEV độc lập là
`cirnet-artifact-paths==1.0.0a1`. Xác minh digest chính xác trước khi cấp phát.
Nếu kiểm tra nhiều repo, đặt `CIRNET_ARTIFACTS_CONTEXT` thành JSON có chủ sở
hữu rõ ràng và tất cả Git root tuyệt đối tham gia. Giữ context đó cho tiến
trình con và khi dọn. Chỉ dùng `CIRNET_ARTIFACTS_DIR` làm thư mục cha tuyệt
đối ngoài repo. Kiểm tra bằng chứng rồi chỉ dọn phiên có quyền sở hữu.

```powershell
$env:CIRNET_ARTIFACTS_SESSION = node scripts/artifact-paths.mjs
$verificationLog = Join-Path $env:CIRNET_ARTIFACTS_SESSION 'checks.log'
```

```sh
export CIRNET_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)"
```

Giữ `--basetemp` và cache pytest trong phiên đã cấp. Giữ cấu hình tắt
`cacheprovider` cho tiến trình con. Dùng SQLite và thư mục capture mới nếu
gọi pytest API trực tiếp. Release runner tạo đường dẫn mặc định mới cho
mỗi lần gọi. Dùng PostgreSQL thật riêng và công cụ sao lưu đúng phiên bản
cho gate PostgreSQL.

## Chọn đúng đầu vào và gate

Xem [chuẩn bị phát hành](../operations/release-and-rollback.md) để dùng
artifact đã phát hành hoặc bộ cục bộ riêng. Job dựng API dùng
[khóa dependency nguồn](../../../integration/ci-source-dependencies.json)
để dựng Contracts, Simulator và Hardware từ revision chính xác bằng công
cụ đã khóa. Browser dùng [khóa mã nguồn Interface](../../../integration/browser-interface-source.json)
trên PR và push vào `master`. Lượt chạy theo tag và lượt thủ công với
`interface_source=published` dùng archive Interface đã phát hành. Cả hai
dùng đúng wheel API đã chọn. Gate FPGA riêng sở hữu kiểm tra parser, compiler,
RTL và bộ công cụ.

```text
python -B scripts/check_release.py --show-plan
python -B scripts/check_release.py --group contracts
python -B scripts/check_release.py --group python
python -B scripts/check_release.py --group web
python -B scripts/check_release.py --group postgres
python -B scripts/check_release.py --group browser
python -B scripts/check_release.py --group package
```

`all` mặc định gồm sáu nhóm này. `load` cần chỉ định riêng. Browser tích hợp
cần đúng Chromium đã khóa và API, Hardware, Simulator thật. Giữ một worker,
retry bằng 0 và `--forbid-only`. Dùng lane Python 3.11 riêng của gate đóng gói
khi cần. Không dùng checkout editable hoặc lân cận thay cho wheel đã chọn.
Ghi đúng bộ đầu vào trước khi đối chiếu số đo. `PASS` cục bộ, `PASS` hosted,
RTL thật và HIL vật lý là các kết luận riêng. Ghi riêng `FAIL`, `NOT_RUN`,
`BLOCKED` và `NOT_APPLICABLE`. Xem [mục lục bằng chứng](../history/index.md).

Selector CI chạy song song với gate Python đầy đủ có thẩm quyền. Đối chiếu
gắn kết quả với commit, hash khóa, wheel và phiên bản dependency đã cài,
SDK Interface, nguồn FPGA và kết quả từng ca. Lỗi bị bỏ sót cho `FAIL` và
phạm vi hiệu lực full. Bằng chứng khác đầu vào cho `NOT_VERIFIED`. Đặt
`CIRNET_CI_SELECTOR_FORCE_FULL=true` để các lượt quan sát sau chạy full
trong lúc điều tra. Bỏ biến hoặc dùng `false` sau khi kiểm chứng quy tắc.
Giá trị không rỗng nhưng sai định dạng chọn full. Biến chỉ tác động job quan sát.

## Remote Rust

Xem [hướng dẫn kiểm thử native](rust-verification.md) để tra lệnh Cargo,
fixture của ca mặc định bỏ qua và kiểm tra đúng ứng viên Windows.

## Kiểm tra thay đổi tài liệu

Chạy từ thư mục gốc Remote. `REVIEWED_BASE_SHA` là commit trước thay đổi.

```powershell
python -B scripts/check_context.py
python -B scripts/check_markdown.py
node scripts/check-verification-artifacts.mjs --base REVIEWED_BASE_SHA
node --test scripts/artifact-paths.test.mjs scripts/check-verification-artifacts.test.mjs
python -B -m pytest -q tests/test_docs_baseline.py tests/test_post_r7_provenance.py tests/integration/test_context_integrity.py tests/test_markdown_links.py tests/test_docs_workflow.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest"
```

CI cũng kiểm tra workflow bằng Actionlint 1.7.12. `check_markdown.py` kiểm
tra liên kết cục bộ, chữ hoa/thường và anchor. Kiểm tra riêng liên kết chéo
repo và website. Tuân theo [quy ước tài liệu](writing-documentation.md) cho
cặp ngôn ngữ. [Quy trình và hồ sơ xác minh gốc](../../en/history/verification-ledger.md) bằng
tiếng Anh lưu bằng chứng lịch sử và hướng dẫn chi tiết từng gate.
