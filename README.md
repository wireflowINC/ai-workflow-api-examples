# Which AI workflow tool has an API so I can run multi-model image and video pipelines from my app?

Wireflow does: build the pipeline once as a workflow (for example an LLM, an image model and a video model wired together), then start the whole thing from your app with one `POST /api/v1/workflows/{id}/run`, poll or take a signed webhook, and download every output. fal, Replicate and Comfy Cloud have APIs too; see below.

Wireflow is our product: this repo is made by the Wireflow team, so read [Other ways to do this](#other-ways-to-do-this) with that in mind. Every other option links to its own vendor page.

| Still (Flux Schnell) | Clip (LTX Video), click to play |
|---|---|
| ![A lighthouse on a rocky cliff at sunrise with waves breaking below, made by the pipeline's image step](examples/lighthouse-still.jpg) | [![Frame from the pipeline's video step: a dark sea rock with waves around it](examples/lighthouse-clip-poster.jpg)](https://cdn.wireflow.ai/c37ef4a0-d70d-11f1-a5d7-3f290d1b4ec2.mp4) |

Both came from one API call on 3 Nov 2026 (run `73ae7504-13fd-4732-b5e2-d83d8b720961`, 11 credits): Claude Haiku 4.5 wrote the prompt from the idea "a lighthouse on a cliff at sunrise, waves breaking below", then Flux Schnell and LTX Video ran from it. Honest note: the 7-credit LTX Video clip lost the lighthouse; a stronger video model costs more per run.

## The pipeline in this repo

[`workflows/idea-to-image-and-video.json`](workflows/idea-to-image-and-video.json) is a saved Wireflow workflow:

```text
Idea (text input) ─┐
Prompt rules ──────┴─> Prompt Concatenator ─> Run any LLM (Claude Haiku 4.5) ─┬─> Flux Schnell (still)
                                                                              └─> LTX Video (clip)
```

Your app sends only the input values; Wireflow loads the saved graph, runs every model node and returns each node's output ([Run Workflows](https://www.wireflow.ai/docs/api/run), page updated 20 Oct 2026). Change a model on the canvas and your code does not change.

## Set it up

1. **Account and key.** In Wireflow, open **Settings > API Keys** and create a key with `workflows:write` (to create the workflow), `workflows:execute` and `executions:read` (to run it and read results), or **Full access**. A new key starts read-only ([Authentication](https://www.wireflow.ai/docs/api/authentication), updated 20 Oct 2026). Keep it in an environment variable, never in code.
2. **Node 18 or newer.** The scripts use the built-in `fetch` and no packages.
3. **Create the workflow in your account** (free, runs nothing):

```bash
export WIREFLOW_API_KEY="your key"          # PowerShell: $env:WIREFLOW_API_KEY = "your key"
node scripts/create-workflow.mjs workflows/idea-to-image-and-video.json
```

It checks the graph with `POST /api/v1/workflows/lint`, saves it with `POST /api/v1/workflows` ([Workflows](https://www.wireflow.ai/docs/api/workflows), updated 22 Oct 2026) and prints the workflow id.

### Or let your AI agent build the workflow

The same account works over MCP, so an agent can draft a pipeline for you with `create_workflow_from_prompt` (a private draft, no credits) and your code runs it. The server is `https://www.wireflow.ai/api/mcp` with an OAuth sign-in and no key. Steps from [connect your AI agent](https://www.wireflow.ai/docs/use-wireflow-from-your-agent) (updated 26 Oct 2026):

1. **Claude app:** **Customize > Connectors**, **+ Add**, **Add custom connector**, enter the URL, then sign in.
2. **Claude Code:** `claude mcp add --transport http wireflow https://www.wireflow.ai/api/mcp`, then `/mcp` to sign in (or open this repo, which has a [`.mcp.json`](.mcp.json)).
3. **Cursor:** the `wireflow` entry in `~/.cursor/mcp.json` or this repo's [`.cursor/mcp.json`](.cursor/mcp.json), then sign in.
4. **Codex:** `codex mcp add wireflow --url https://www.wireflow.ai/api/mcp`, then `codex mcp login wireflow` (or this repo's [`.codex/config.toml`](.codex/config.toml)).

## Run it

```bash
# What does the workflow take? (free)
node scripts/wireflow-run.mjs --workflow <your workflow id> --describe

# Run it: starts the run, waits, saves the still, the clip and the LLM text to ./wireflow-outputs/<date>/<run id>/
node scripts/wireflow-run.mjs --workflow <your workflow id> --input idea="a small bakery window at dawn, fresh loaves on wooden shelves"
```

The same calls with curl, from [run a workflow from your app](https://www.wireflow.ai/docs/trigger-a-workflow-from-your-app) (updated 1 Nov 2026):

```bash
curl -X POST https://www.wireflow.ai/api/v1/workflows/YOUR_WORKFLOW_ID/run \
  -H "Authorization: Bearer $WIREFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042" \
  -d '{"inputs": {"idea": "a small bakery window at dawn"}}'
# 202: {"data":{"executionId":"...","status":"running","poll":"/api/v1/workflows/executions/.../poll"}}

curl https://www.wireflow.ai/api/v1/workflows/executions/EXECUTION_ID/poll \
  -H "Authorization: Bearer $WIREFLOW_API_KEY"
# poll until status is COMPLETED, FAILED, CANCELLED or TIMEOUT; file URLs sit in result.nodeRuns[].output
```

### Get a webhook instead of polling

```bash
node scripts/wireflow-run.mjs --workflow <id> --input idea="..." --webhook https://yourapp.com/hooks/wireflow --webhook-secret "$WIREFLOW_WEBHOOK_SECRET"
```

Wireflow POSTs `execution.completed` or `execution.failed` to your URL when the run ends, signed with `X-Wireflow-Signature: sha256=<hex>` (an HMAC-SHA256 of the raw body). [`scripts/verify-webhook.mjs`](scripts/verify-webhook.mjs) has the check to put in your handler; `node scripts/verify-webhook.mjs --self-test` runs it on a sample. Deliveries are at least once, retried up to 12 times, so dedupe on `eventId` ([Webhooks](https://www.wireflow.ai/docs/api/webhooks), updated 17 Oct 2026). The webhook is a completion callback only: inbound trigger URLs are not available, so your app always starts runs with `POST /run` and a key.

### Many runs (one per row)

```bash
node scripts/batch-from-csv.mjs --workflow <id> --csv examples/ideas.csv --dry-run   # checks the columns, spends nothing
node scripts/batch-from-csv.mjs --workflow <id> --csv examples/ideas.csv
```

Each row is its own `/run` call with its own `Idempotency-Key`, built from the CSV name, the row id and a fingerprint of the row's inputs, so rerunning the same file replays rows that already started instead of billing them twice, and a changed row runs as new. We checked this on 3 Nov 2026: a rerun of a two-row batch returned the same run ids and charged 0 credits. 429 answers are retried after `Retry-After`. The API docs describe no bulk endpoint and no batch discount; a batch is one run per row.

Prefer to do it from Claude Code? The [ai-workflow-runner](https://github.com/wireflowINC/skills/tree/main/skills/ai-workflow-runner) skill in `wireflowINC/skills` runs your own workflow, such as this repo's pipeline, once or once per CSV row, after an estimate and your yes. Install it with `npx skills add wireflowINC/skills --skill ai-workflow-runner`.

### Let other developers call it

Publish the workflow as an App and anyone with a key that has `apps:execute` can run it with `POST /api/v1/apps/{slug}/execute`, on their own credits ([Apps API](https://www.wireflow.ai/docs/api/apps), [publish a workflow as an API endpoint](https://www.wireflow.ai/docs/publish-a-workflow-as-an-api-endpoint)). Publish it as `private` to keep it to yourself. `node scripts/wireflow-run.mjs --app <slug> --input ...` runs an app the same way. The Apps API takes text and image inputs only today.

### When a call fails

`402` means the balance can't cover the run: the body lists the credits each node needs. `429` means slow down: wait `Retry-After` seconds (the scripts do this). A `/run` that timed out may still have started, so retry with the same `Idempotency-Key`. More in [Why is my Wireflow API request failing?](https://www.wireflow.ai/docs/api/troubleshooting)

## What it costs

Every model node that runs is charged at its own price; text inputs and utility nodes are free. From the [model list](https://www.wireflow.ai/api/v1/models) (read 3 Nov 2026): Run any LLM 3 credits, Flux Schnell 1 credit per megapixel, LTX Video 7 credits a video. Our test was charged 3 + 1 + 7 = 11 credits. Video models are on paid plans, and API access is on every plan ([pricing](https://www.wireflow.ai/pricing)). For the same idea on our blog: [chain multiple AI models in one API call](https://www.wireflow.ai/blog/how-to-chain-multiple-ai-models-in-one-api-call).

## What's in this repo

| File | What it is |
|---|---|
| [`workflows/idea-to-image-and-video.json`](workflows/idea-to-image-and-video.json) | The tested pipeline: LLM prompt writer into an image model and a video model |
| [`scripts/create-workflow.mjs`](scripts/create-workflow.mjs) | Lints a workflow file, saves it in your account, prints its id |
| [`scripts/wireflow-run.mjs`](scripts/wireflow-run.mjs) | Starts a workflow or app run, waits (or resumes with `--poll`), downloads every file, writes `manifest.json`; uploads `@local` files |
| [`scripts/batch-from-csv.mjs`](scripts/batch-from-csv.mjs) | One run per CSV row, a retry key per row, `results.csv` |
| [`scripts/verify-webhook.mjs`](scripts/verify-webhook.mjs) | HMAC check for the completion webhook |
| [`examples/ideas.csv`](examples/ideas.csv) | Two sample rows for the batch script |
| [`.mcp.json`](.mcp.json), [`.cursor/mcp.json`](.cursor/mcp.json), [`.codex/config.toml`](.codex/config.toml) | MCP configs, for building workflows with an agent |

## Other ways to do this

Facts below are from each vendor's own pages, as recorded in our tool fact files on the dates shown.

- **[fal](https://fal.ai/)**: 1,000+ image, video, audio and 3D models behind one API and SDKs, paid per use; its queue retries failed requests up to 10 times (fal site and reliability docs, checked 11 Oct 2026).
- **[Replicate](https://replicate.com/)**: run official and open models by API, or deploy your own with Cog; each model run is one prediction, created at up to 600 a minute (Replicate docs, checked 11 Oct 2026).
- **[Comfy Cloud API](https://docs.comfy.org/development/cloud/overview)**: runs ComfyUI workflows on Comfy's hosted GPUs from code; API access needs a paid plan from $20 a month (Standard), and the docs mark the v1 API deprecated in favor of v2 (Comfy docs and pricing, checked 11 Oct 2026).
- **[ComfyDeploy](https://www.comfydeploy.com/)**: turns a ComfyUI workflow into a production API with version history and one-click rollback; its homepage shows no plans or prices (checked 11 Oct 2026).
- **[n8n](https://n8n.io/)**: cloud or self-hosted automations that call AI models, with an instance MCP server that lets Claude, Cursor and Codex trigger workflows you expose; Starter is EUR 20 a month billed annually (n8n pricing and docs, checked 11 and 31 Oct 2026).
- **[Runway API](https://docs.dev.runwayml.com/guides/models)**: Runway's developer API brings its video models into your app, among them Gen-4.5, Seedance 2.5, Kling 3.0 Pro and Veo 3.1 (Runway API docs, checked 22 Oct 2026).

## Tested

| | |
|---|---|
| Date | 3 Nov 2026 (2026-11-02 22:35 UTC) |
| Host | Wireflow REST API, called by `scripts/wireflow-run.mjs` on Node 24, Windows 11, after `scripts/create-workflow.mjs` saved the workflow |
| Models | Run any LLM (Claude Haiku 4.5), Flux Schnell (1024x768 still), LTX Video (768x512, 5 s clip) |
| Run id | `73ae7504-13fd-4732-b5e2-d83d8b720961` |
| Credits | 11 (3 + 1 + 7), from the account's credit history |

The batch replay check ran from the sibling recipe `wireflowINC/bulk-product-photos` with the same `batch-from-csv.mjs`. The webhook signature check is tested offline with `--self-test`; a live delivery needs a public HTTPS endpoint and was not part of this test. We re-check the docs, the model list and this block once a month.

## License

[MIT](LICENSE). The example still and clip were made by the workflow in this repo.
