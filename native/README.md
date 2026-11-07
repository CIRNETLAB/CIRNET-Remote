# Rust Remote component

This crate owns the native Remote API, authorization, persistence and
scheduler. `src/` contains the service and `tests/` contains Rust fixture
cases. The crate uses the pinned Contracts types and calls Hardware through
local RPC. See the repository's [system architecture](../docs/en/architecture/system.md)
for ownership and the [selected release](../integration/release-set.json) for
published artifact identities.

Read the verification guide for build, test and fixture selection.
[English](../docs/en/contributing/rust-verification.md) · [Tiếng Việt](../docs/vi/contributing/rust-verification.md)
