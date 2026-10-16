# Supported compatibility anchors

`2026-10-16/baseline.json` retains the pre-W1 supported schema/protobuf source bytes and their recorded Git provenance. `2026-10-16/public-wire-baseline.json` records the post-W7 public operation/schema and NCAP layout anchors from the reviewed workspace. Both are explicitly **supported unpublished baselines**, not released ABI or hardware-operation claims. Read-only Git metadata prevented the requested phase commits; the public snapshot does not invent a commit or tag.

Run after checking generated artifacts:

```sh
python scripts/check_public_compatibility.py
python -m pytest tests/contracts/test_public_compatibility.py
```

The checker compares every existing operation ID, path/method, parameters, request/response media and schemas, global and effective operation security requirement, effective JSON Schema dialect, named component definition, schema URI/version/profile annotation and existing NCAP layout section. Absent root security and dialect fields in the initial snapshot mean the OpenAPI 3.1 defaults (no inherited security and the OAS 3.1 base dialect); they never permit arbitrary additions. Changes fail conservatively. New operations and separately named/versioned contracts may be added while the existing anchors remain available. Unsupported operation/reference shapes fail explicitly. This is a frozen-wire comparison, not a general JSON Schema subtyping or semantic compatibility proof.

Schema and operation descriptions/titles/examples are editorial. Only actual schema positions are traversed, so a property named `description` or a default/example containing schema-like keys remains data. Ownership prose in the manifest is outside the wire snapshot. Booleans and numbers remain distinct. NCAP magic, prefix, endianness, records, versions and resource bounds are part of the supported format contract.

The command has no write/update mode. A changed supported shape needs an explicit version and migration or a reviewed compatibility-policy decision; regenerating artifacts does not approve breaking an existing wire. Retain the old version and add the replacement alongside it. Do not replace this baseline merely to turn a failed check green. CI also checks the original schema/protobuf byte baseline, shared Python/browser fixtures, negative mutation tests, generated operations and installed-package resources; passing these anchors alone cannot prove electrical safety, physical capability or every consumer behavior.
