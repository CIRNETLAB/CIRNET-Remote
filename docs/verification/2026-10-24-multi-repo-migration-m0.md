# Multi-Repo Migration M0 — approval and plan verification

Date: **2026-10-24, Asia/Saigon**. Scope: lưu assessment M0 đã được người dùng duyệt thành [migration plan](../superpowers/plans/2026-10-24-multi-repo-migration-m0.md), cập nhật documentation index và kiểm tra tài liệu. Authority giữ nguyên [Lab-First v3.1](../ARCHITECTURE.md) và [verification policy](../VERIFICATION.md).

## Revision and authorization

Source HEAD: `295797c581acc3935f5e128fd3d23674c728ca65`, branch `master`; worktree/index sạch trước lần lưu tài liệu. Người dùng duyệt M0 và yêu cầu tạo bản kế hoạch; không yêu cầu thực hiện M1 hoặc stage/commit/push.

Assessment trước đó đọc 1.145 tracked files theo inventory, manifests/generators/CI và source boundaries liên quan; ghi ownership, dependency graph, blockers và roadmap. Remote-read/access/license observations trong plan là kết quả của assessment đó, không được trình bày như remote probes mới của lần lưu tài liệu này.

## Changed documentation

- Added: `docs/superpowers/plans/2026-10-24-multi-repo-migration-m0.md`.
- Added: this Markdown verification record.
- Updated: `docs/README.md` để tìm thấy plan và record.

Không sửa application/source, Contracts, package manifests, CI, deployment hoặc license. Không extraction, code generation, branch creation, staging, commit, push, migration/deployment hoặc hardware operation.

## Verification results

Environment: Windows PowerShell; existing API virtual environment, Python **3.14.4**, pytest **9.1.1**, Node **24.20.0**, Git **2.52.0.windows.1**. Không cài dependency. Đây là documentation verification, không thay thế Python 3.11/3.12 consumer/package matrix của migration.

| Check | Result |
| --- | --- |
| Context markers / canonical authority | PASS: `scripts/check_context.py` |
| Managed Markdown links/case/anchors | PASS: 174 files, 0 errors; external URLs not fetched |
| Documentation, provenance, context, links and clean-startup pytest suite | PASS: 13 tests in 0.99 s |
| Worktree/index artifact policy | PASS: `scripts/check-verification-artifacts.mjs` |
| Whitespace / final Git scope | PASS: `git diff --check`; only the three Markdown paths above; index empty |
| Ignored physical output inventory and developer database preservation | PASS: all 22 ignored entries retain file counts/sizes/mtime metadata digests; developer database SHA-256 unchanged |

Commands were run from the repository root with `PYTHONDONTWRITEBYTECODE=1`, a shared allocator-owned external session and the existing `services/api/.venv/Scripts/python.exe` interpreter. The pytest invocation disabled the repository cache and used an external `--basetemp`:

```text
python -B scripts/check_context.py
python -B scripts/check_markdown.py
python -B -m pytest -q -p no:cacheprovider tests/test_docs_baseline.py tests/test_post_r7_provenance.py tests/integration/test_context_integrity.py tests/test_markdown_links.py tests/test_docs_workflow.py --basetemp <owned-external-session>/pytest
node scripts/check-verification-artifacts.mjs
git diff --check
```

The before/after physical inventory covered every ignored entry reported by Git, including build/distribution/dependency trees, Python caches, generated RPC files, virtual environment, egg-info and the developer database. Database SHA-256 remains `908ac5d51719c5430e10f499687f2afe2a26351478c56ef80fbd68e2ec38c835`. Metadata comparison is not a content-hash claim for every dependency file.

Application builds/tests, full W0–W8 regression, browser/visual tests, PostgreSQL, installed-package releases, hosted CI, target deployment and physical hardware: **NOT_RUN**, outside this documentation-only request. Historical results retain their original scope; no fresh product PASS is claimed.

## Artifact handling

An owned external session was allocated by the shared allocator before verification output. Logs and pytest temporary files must remain there. Bytecode writes and pytest repository cache are disabled for these commands. No browser/screenshots/video/traces are generated, so visual inspection is not applicable. Existing outputs/assets/baselines/evidence are preserved.

All four external command logs were read and their successful results inspected after completion. The allocator's guarded cleanup removed only this session; a physical existence check returned false. No temporary artifact links are retained. No pre-existing evidence/output was removed, and no application/source was changed. Final Markdown/context/artifact/whitespace checks are repeated after recording these results.
