# End-to-End Tests

The current real-browser suite lives in [apps/web/e2e](../../apps/web/e2e), with setup and exact commands in the [Web README](../../apps/web/README.md). Pinned Playwright/Chromium runs the existing Web/API/temporary SQLite/Hardware Service/virtual simulator pipeline; Node/SFC tests remain separate unit coverage.

Implemented browser flows cover authenticated projects and save conflicts/reload/API restart, assignment publication and role isolation, lost Create acknowledgement without replaying Run, actual switches→AND→LED captures, retained history, instrument pre-run settings, imported GLB previews and native WebGL context recovery. The [release evidence](../../docs/verification/2026-10-16-w8-release.md) records the executed gate and its result; [browser CI](../../.github/workflows/browser-e2e.yml) runs the complete suite with focused tests forbidden.

Physical FPGA/Scope/Generator execution remains unavailable and unverified. Test doubles and explicitly synthetic codec fixtures establish software boundaries only; they are not runtime waveform fallback or hardware evidence.
