import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ChangeMetrics,
  type PriceCard,
  type Prices,
  type TokenUsageMetric,
  costFor,
  defaultPricesYamlPath,
  initProject,
  loadConfig,
  loadPrices,
  phaseTiming,
  renderChangeReport,
  reportAllChanges,
  reportChange,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function card(input: number, output = 15): PriceCard {
  return {
    input_per_million_usd: input,
    cache_read_per_million_usd: 0.3,
    cache_write_per_million_usd: 3.75,
    output_per_million_usd: output,
  };
}

function prices(overrides?: {
  usdToInr?: number;
  claude?: PriceCard;
  codex?: PriceCard;
  models?: Record<string, PriceCard>;
}): Prices {
  return {
    usd_to_inr: overrides?.usdToInr ?? 84,
    models: {
      default: card(3),
      ...(overrides?.claude ? { "claude-code": overrides.claude } : {}),
      ...(overrides?.codex ? { codex: overrides.codex } : {}),
      ...overrides?.models,
    },
  };
}

function phase(name: string, startedAt: string, endedAt?: string) {
  return endedAt ? { phase: name, startedAt, endedAt } : { phase: name, startedAt };
}

function request(
  overrides: Partial<TokenUsageMetric> & Pick<TokenUsageMetric, "provider">,
): TokenUsageMetric {
  return {
    requestId: "request-1",
    phase: "intent",
    startedAt: "2026-01-01T00:00:00.000Z",
    inputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    outputTokens: null,
    measured: true,
    ...overrides,
  };
}

function metrics(
  phases: ChangeMetrics["phases"],
  requests: TokenUsageMetric[] = [],
): ChangeMetrics {
  return { version: 1, phases, requests };
}

function render(
  changeMetrics: ChangeMetrics,
  options?: { prices?: Prices | null; handoffCodePoints?: number | null; now?: Date; id?: string },
): string {
  return renderChangeReport({
    changeId: options?.id ?? "demo",
    metrics: changeMetrics,
    prices: options?.prices === undefined ? prices() : options.prices,
    handoffCodePoints: options?.handoffCodePoints === undefined ? null : options.handoffCodePoints,
    now: options?.now ?? new Date("2026-01-01T01:05:30.000Z"),
  });
}

describe("phase time report", () => {
  it("keeps open active time and counts only gaps between phases as wait", () => {
    const now = new Date("2026-01-01T01:05:30.000Z");
    const phases = [
      phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z"),
      phase("implement", "2026-01-01T00:40:00.000Z", "2026-01-01T00:40:00.000Z"),
      phase("local_verify", "2026-01-01T01:00:00.000Z"),
    ];
    const timing = phaseTiming(phases, now);
    expect(timing.activeMs).toBe(15 * 60_000 + 30_000);
    expect(timing.waitMs).toBe(50 * 60_000);
    expect(timing.totalMs).toBe(65 * 60_000 + 30_000);

    const text = render(metrics(phases), { now, handoffCodePoints: 0 });
    expect(text).toContain("Active: 0h 15m 30s");
    expect(text).toContain("Human wait: 0h 50m 0s");
    expect(text).toContain("Total: 1h 5m 30s");
    expect(text).toContain("in progress");
    expect(text).toContain(new Date("2026-01-01T00:00:00.000Z").toLocaleString());
    expect(text).not.toContain("2026-01-01T01:05:30.000Z");
    expect(text).toContain("active 0h 10m 0s");
    expect(text).toContain("active 0h 0m 0s");
    expect(text).toContain("active 0h 5m 30s");
  });

  it("leaves the idle tail after the last closed phase out of active and wait", () => {
    const now = new Date("2026-01-01T03:00:00.000Z");
    const phases = [
      phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z"),
      phase("implement", "2026-01-01T00:40:00.000Z", "2026-01-01T01:00:00.000Z"),
    ];
    const text = render(metrics(phases), { now, handoffCodePoints: 0 });
    expect(text).toContain("Active: 0h 30m 0s");
    expect(text).toContain("Human wait: 0h 30m 0s");
    expect(text).toContain("Total: 1h 0m 0s");
    expect(text).toContain(new Date("2026-01-01T01:00:00.000Z").toLocaleString());
    expect(text).not.toContain(new Date("2026-01-01T03:00:00.000Z").toLocaleString());
    expect(text).not.toContain("in progress");
  });

  it("adds no wait on a shared boundary and renders 90000ms as 0h 1m 30s", () => {
    const boundary = render(
      metrics([
        phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z"),
        phase("implement", "2026-01-01T00:10:00.000Z", "2026-01-01T00:10:00.000Z"),
      ]),
      { handoffCodePoints: 0 },
    );
    expect(boundary).toContain("Human wait: 0h 0m 0s");
    expect(boundary).toContain("Active: 0h 10m 0s");

    const ninety = render(
      metrics([phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:01:30.000Z")]),
      { handoffCodePoints: 0 },
    );
    expect(ninety).toContain("Active: 0h 1m 30s");
  });
});

describe("token cost report", () => {
  it("uses the provider card when present and models.default otherwise", () => {
    const table = prices({ claude: card(9) });
    const text = render(
      metrics(
        [phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z")],
        [
          request({ provider: "codex", requestId: "codex-1", inputTokens: 1_000_000 }),
          request({ provider: "claude-code", requestId: "claude-1", inputTokens: 1_000_000 }),
        ],
      ),
      { prices: table, handoffCodePoints: 99 },
    );
    expect(text).toContain(
      "measured  intent  claude-code  n/a  1  1000000  n/a  n/a  n/a  9.0000  756.00",
    );
    expect(text).toContain(
      "measured  intent  codex  n/a  1  1000000  n/a  n/a  n/a  3.0000  252.00",
    );
    expect(text).toContain(
      "measured  total  all  all  2  2000000  n/a  n/a  n/a  12.0000  1008.00",
    );
    expect(text).not.toContain("estimated");
    expect(
      costFor({ input: 1_000_000, cacheRead: null, cacheWrite: null, output: null }, card(9), 84),
    ).toEqual({
      usd: "9.0000",
      inr: "756.00",
    });
  });

  it("prices the model card, then the provider card, then default", () => {
    const table = prices({ models: { "grok-4": card(9), grok: card(4) } });
    const text = render(
      metrics(
        [phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z")],
        [
          request({
            provider: "grok",
            model: "grok-4",
            requestId: "model-card",
            inputTokens: 1_000_000,
          }),
          request({
            provider: "grok",
            model: "grok-4.7-build",
            requestId: "provider-card",
            inputTokens: 1_000_000,
          }),
          request({ provider: "codex", requestId: "default-card", inputTokens: 1_000_000 }),
        ],
      ),
      { prices: table, handoffCodePoints: 99 },
    );
    expect(text).toContain("source  phase  provider  model  requests");
    expect(text).toContain(
      "measured  intent  grok  grok-4  1  1000000  n/a  n/a  n/a  9.0000  756.00",
    );
    expect(text).toContain(
      "measured  intent  grok  grok-4.7-build  1  1000000  n/a  n/a  n/a  4.0000  336.00",
    );
    expect(text).toContain(
      "measured  intent  codex  n/a  1  1000000  n/a  n/a  n/a  3.0000  252.00",
    );
    expect(text).toContain(
      "measured  total  all  all  3  3000000  n/a  n/a  n/a  16.0000  1344.00",
    );
  });

  it("shows n/a for a missing prices file and does not write metrics or prices", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-report-missing-prices-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const changeDir = join(root, "changes", "priced");
    const metricsPath = join(changeDir, "metrics.json");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(changeDir, { recursive: true });
    const body = `${JSON.stringify(
      metrics(
        [phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z")],
        [request({ provider: "claude-code", requestId: "kept", inputTokens: 10 })],
      ),
      null,
      2,
    )}\n`;
    await writeFile(metricsPath, body);
    const pricesPath = join(root, ".sdd/prices.yaml");
    await rm(pricesPath);

    const text = await reportChange({
      projectRoot: root,
      config,
      changeId: "priced",
      prices: await loadPrices(root),
      now: new Date("2026-01-01T01:00:00.000Z"),
    });
    expect(text).toContain("prices.yaml is missing");
    expect(text).toContain("n/a  n/a");
    expect(text).not.toMatch(/\d\.\d{4}/);
    expect(await readFile(metricsPath, "utf8")).toBe(body);
    await expect(readFile(pricesPath, "utf8")).rejects.toThrow();
  });

  it("rejects an invalid prices file without rendering a token table or writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-report-bad-prices-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const pricesPath = join(root, ".sdd/prices.yaml");
    const invalid = "usd_to_inr: -1\n";
    await writeFile(pricesPath, invalid);
    await expect(loadPrices(root)).rejects.toThrow("prices.yaml is invalid");
    expect(await readFile(pricesPath, "utf8")).toBe(invalid);
  });

  it("excludes null token counts and prices a numeric zero", () => {
    const table = prices({
      usdToInr: 84,
      claude: card(1, 1),
    });
    const text = render(
      metrics(
        [
          phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z"),
          phase("implement", "2026-01-01T00:10:00.000Z", "2026-01-01T00:20:00.000Z"),
        ],
        [
          request({
            provider: "claude-code",
            requestId: "input-only",
            phase: "intent",
            inputTokens: 1_500_000,
            outputTokens: null,
          }),
          request({
            provider: "claude-code",
            requestId: "all-null",
            phase: "implement",
          }),
          request({
            provider: "codex",
            requestId: "zero",
            phase: "implement",
            inputTokens: 0,
          }),
        ],
      ),
      { prices: table },
    );
    expect(text).toContain(
      "measured  intent  claude-code  n/a  1  1500000  n/a  n/a  n/a  1.5000  126.00",
    );
    expect(text).toContain(
      "measured  implement  claude-code  n/a  1  n/a  n/a  n/a  n/a  n/a  n/a",
    );
    expect(text).toContain("measured  implement  codex  n/a  1  0  n/a  n/a  n/a  0.0000  0.00");
  });

  it("rounds USD half away from zero before showing INR from the unrounded sum", () => {
    const figures = costFor(
      { input: 5, cacheRead: null, cacheWrite: null, output: null },
      card(10),
      84,
    );
    expect(figures).toEqual({ usd: "0.0001", inr: "0.00" });
  });

  it("estimates from handoff code points only when nothing was measured", () => {
    const unmeasured = render(metrics([]), { handoffCodePoints: Array.from("abcd😀").length });
    expect(unmeasured).toContain("estimated (handoff code points / 4)");
    expect(unmeasured).toContain("n/a  default  n/a  1  1  n/a  n/a  n/a");
    expect(unmeasured).not.toContain("measured  total");
    expect(unmeasured).not.toContain("No estimate:");

    const zero = render(metrics([]), { handoffCodePoints: Array.from("abc").length });
    expect(zero).toContain("n/a  default  n/a  1  0  n/a  n/a  n/a  0.0000  0.00");

    const measured = render(
      metrics(
        [phase("intent", "2026-01-01T00:00:00.000Z")],
        [request({ provider: "claude-code", requestId: "blank" })],
      ),
      { handoffCodePoints: Array.from("abcd😀").length },
    );
    expect(measured).not.toContain("estimated");
    expect(measured).toContain("measured  total  all  all  1  n/a  n/a  n/a  n/a  n/a  n/a");

    const missing = render(metrics([]), { handoffCodePoints: null });
    expect(missing).toContain("  (none)");
    expect(missing).toContain("No estimate: .sdd/handoff.md is missing.");
    expect(missing).not.toContain("estimated");
  });

  it("adds a decision section without changing the request rows", () => {
    const table = prices();
    const text = render(
      {
        ...metrics(
          [phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z")],
          [request({ provider: "codex", requestId: "codex-1", inputTokens: 1_000_000 })],
        ),
        decisions: [
          {
            workType: "route",
            kind: "decide",
            provider: "command",
            model: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            inputTokens: 1_000_000,
            cacheReadTokens: null,
            cacheWriteTokens: null,
            outputTokens: null,
          },
        ],
      },
      { prices: table, handoffCodePoints: 99 },
    );
    expect(text).toContain("source  phase  provider  model  requests");
    expect(text).toContain(
      "measured  intent  codex  n/a  1  1000000  n/a  n/a  n/a  3.0000  252.00",
    );
    expect(text).toContain("measured  total  all  all  1  1000000  n/a  n/a  n/a  3.0000  252.00");
    expect(text).toContain("Decisions:");
    expect(text).toContain(
      "work_type  kind  provider  model  calls  input  cache_read  cache_write  output  usd  inr",
    );
    expect(text).toContain(
      "route  decide  command  n/a  1  1000000  n/a  n/a  n/a  3.0000  252.00",
    );
    expect(text).not.toContain("measured  intent  command");

    const empty = render(
      {
        ...metrics(
          [phase("intent", "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z")],
          [request({ provider: "codex", requestId: "codex-1", inputTokens: 1_000_000 })],
        ),
        decisions: [],
      },
      { prices: table, handoffCodePoints: 99 },
    );
    expect(empty).toContain(
      "measured  intent  codex  n/a  1  1000000  n/a  n/a  n/a  3.0000  252.00",
    );
    expect(empty).not.toContain("Decisions:");
  });
});

describe("report files", () => {
  it("sorts --all by first phase start and skips directories without metrics.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-report-all-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const { mkdir } = await import("node:fs/promises");
    async function put(id: string, body: unknown | null) {
      const dir = join(root, "changes", id);
      await mkdir(dir, { recursive: true });
      if (body) await writeFile(join(dir, "metrics.json"), JSON.stringify(body));
    }
    const closed = (startedAt: string) => metrics([phase("intent", startedAt, startedAt)]);
    await put("change-c", closed("2026-01-03T00:00:00.000Z"));
    await put("change-b", closed("2026-01-02T00:00:00.000Z"));
    await put("change-a", closed("2026-01-02T00:00:00.000Z"));
    await put("change-d", null);
    await put("change-m", metrics([]));
    await put("change-z", null);
    await writeFile(join(root, "changes", "change-z", "metrics.json"), "{");

    const emptyRoot = await mkdtemp(join(tmpdir(), "sdd-report-none-"));
    temps.push(emptyRoot);
    await initProject({ projectRoot: emptyRoot, agents: false });
    const emptyConfig = await loadConfig(emptyRoot);
    expect(await reportAllChanges(emptyRoot, emptyConfig, prices(), new Date())).toBe(
      "No change metrics found.",
    );

    const text = await reportAllChanges(
      root,
      config,
      prices(),
      new Date("2026-01-04T00:00:00.000Z"),
    );
    const order = ["change-a", "change-b", "change-c", "change-m", "change-z"].map((id) =>
      text.indexOf(`Change: ${id}`),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toContain("change-d");
    expect(text).toContain("Change: change-z\nmetrics.json is invalid");
    expect(text).not.toContain("Unexpected");
    expect(text).not.toContain(root);

    await writeFile(join(root, "changes", "change-a", "metrics.json"), "{");
    await expect(
      reportChange({
        projectRoot: root,
        config,
        changeId: "change-a",
        prices: prices(),
        now: new Date(),
      }),
    ).rejects.toThrow("metrics.json is invalid");
  });

  it("loads the shipped prices file and defaults an omitted conversion rate to 84", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-report-default-prices-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const loaded = await loadPrices(root);
    expect(loaded?.usd_to_inr).toBe(84);
    expect(loaded?.models.default.input_per_million_usd).toBe(3);
    expect(await readFile(join(root, ".sdd/prices.yaml"), "utf8")).toBe(
      await readFile(defaultPricesYamlPath(), "utf8"),
    );
    await writeFile(
      join(root, ".sdd/prices.yaml"),
      "models:\n  default:\n    input_per_million_usd: 1\n    cache_read_per_million_usd: 1\n    cache_write_per_million_usd: 1\n    output_per_million_usd: 1\n",
    );
    expect((await loadPrices(root))?.usd_to_inr).toBe(84);
  });
});
