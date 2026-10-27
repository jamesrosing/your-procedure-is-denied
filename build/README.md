# /build

Everything in this directory was written during the Meta Global AI Developer Hackathon, October 26 to November 4, 2026. See [NEW-WORK.md](../NEW-WORK.md) for the ledger.

Contents:

- `src/test-call.ts`: one call to muse-spark-1.3 on the Meta Model API through the Anthropic SDK base-URL swap. Run with `npm run test-call`; it reads `MODEL_API_KEY` from the repository `.env`.

Models are called only over hosted APIs; nothing runs locally.

All data used here is synthetic. No real patient data is used anywhere in this repository.
