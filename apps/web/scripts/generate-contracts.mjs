// The standalone Contracts repository owns DTO/Ajv generation after M1.
// Remote consumes the prebuilt public package; it must not run a second writer.
throw new Error('Contracts generation moved to the standalone Contracts repository. Use the pinned public SDK or python scripts/generate_contracts.py --check from Remote.');
