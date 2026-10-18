import { rm, stat } from "node:fs/promises";
import { join } from "pathe";
import { sddRoot } from "../paths.js";

export const EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";
export const EMBEDDING_DIM = 384;
export const EMBEDDINGS_UNAVAILABLE = "Embeddings are unavailable. Using keyword search.";

const MODEL_DIR = "Qdrant_bge-small-en-v1.5-onnx-Q";
const CACHE_FILES = [
  "model_optimized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
  "config.json",
  "special_tokens_map.json",
];

export interface Embedder {
  /** One L2-normalized vector per text, same order. Text is the raw chunk body. */
  embedPassages(texts: readonly string[]): Promise<Float32Array[]>;
  /** One L2-normalized vector for the raw user query. */
  embedQuery(text: string): Promise<Float32Array>;
}

export interface SearchRuntime {
  embedder?: Embedder;
  /** Called instead of fastembed. A throw is an embedder failure. */
  embedderFactory?: () => Promise<Embedder>;
}

export type EmbedFailure = "none" | "load" | "query";

interface FastembedModel {
  passageEmbed(texts: readonly string[], batchSize: number): AsyncIterable<ArrayLike<number>[]>;
  queryEmbed(text: string): Promise<ArrayLike<number>>;
}

type FastembedInit = (options: {
  model: unknown;
  executionProviders: unknown[];
  maxLength: number;
  showDownloadProgress: boolean;
  cacheDir: string;
}) => Promise<FastembedModel>;

export interface FastembedHooks {
  init?: FastembedInit;
}

/** Incremented only when the embeddings-on path evaluates `import("fastembed")`. */
export let fastembedImportCount = 0;

const ready = new Map<string, Promise<Embedder>>();
const projectSessions = new Map<string, Promise<Embedder | null>>();
const runtimeSessions = new WeakMap<SearchRuntime, Promise<Embedder | null>>();

async function cacheComplete(dir: string): Promise<boolean> {
  for (const name of CACHE_FILES) {
    try {
      const info = await stat(join(dir, name));
      if (!info.isFile() || info.size <= 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function asFloat32(value: ArrayLike<number>): Float32Array {
  if (value instanceof Float32Array) return value;
  return Float32Array.from(value);
}

function wrapModel(model: FastembedModel): Embedder {
  return {
    async embedPassages(texts) {
      const out: Float32Array[] = [];
      for await (const batch of model.passageEmbed(texts, 16)) {
        for (const vector of batch) out.push(asFloat32(vector));
      }
      if (out.length !== texts.length) throw new Error("Embedding batch length does not match.");
      for (const vector of out) {
        if (vector.length !== EMBEDDING_DIM) throw new Error("Embedding length is not 384.");
      }
      return out;
    },
    async embedQuery(text) {
      const vector = asFloat32(await model.queryEmbed(text));
      if (vector.length !== EMBEDDING_DIM) throw new Error("Embedding length is not 384.");
      return vector;
    },
  };
}

async function importFastembed(): Promise<typeof import("fastembed")> {
  fastembedImportCount += 1;
  return import("fastembed");
}

async function initReal(cacheDir: string): Promise<FastembedModel> {
  const mod = await importFastembed();
  return mod.FlagEmbedding.init({
    model: mod.EmbeddingModel.BGESmallENV15,
    executionProviders: [mod.ExecutionProvider.CPU],
    maxLength: 512,
    showDownloadProgress: false,
    cacheDir,
  });
}

async function start(projectRoot: string, hooks?: FastembedHooks): Promise<Embedder> {
  const cacheDir = join(sddRoot(projectRoot), "models", "fastembed");
  const modelDir = join(cacheDir, MODEL_DIR);
  const completeBefore = await cacheComplete(modelDir);
  try {
    const model = hooks?.init
      ? await hooks.init({
          model: "BGESmallENV15",
          executionProviders: ["cpu"],
          maxLength: 512,
          showDownloadProgress: false,
          cacheDir,
        })
      : await initReal(cacheDir);
    return wrapModel(model);
  } catch (err) {
    if (!completeBefore) await rm(modelDir, { recursive: true, force: true });
    throw err;
  }
}

/** Fastembed adapter. One successful session per cache directory per process. */
export function createFastembedEmbedder(
  projectRoot: string,
  hooks?: FastembedHooks,
): Promise<Embedder> {
  if (hooks?.init) return start(projectRoot, hooks);
  const cacheDir = join(sddRoot(projectRoot), "models", "fastembed");
  const existing = ready.get(cacheDir);
  if (existing) return existing;
  const pending = start(projectRoot).catch((err: unknown) => {
    ready.delete(cacheDir);
    throw err;
  });
  ready.set(cacheDir, pending);
  return pending;
}

/** Embeddings off returns null and does not import fastembed. */
export function resolveEmbedder(
  projectRoot: string,
  embeddings: boolean,
  runtime?: SearchRuntime,
): Promise<Embedder | null> {
  if (!embeddings) return Promise.resolve(null);
  if (runtime?.embedder) return Promise.resolve(runtime.embedder);
  if (runtime?.embedderFactory) {
    const existing = runtimeSessions.get(runtime);
    if (existing) return existing;
    const pending = runtime
      .embedderFactory()
      .then((embedder) => embedder)
      .catch(() => null);
    runtimeSessions.set(runtime, pending);
    return pending;
  }
  const existing = projectSessions.get(projectRoot);
  if (existing) return existing;
  const pending = createFastembedEmbedder(projectRoot).then(
    (embedder) => embedder,
    () => null,
  );
  projectSessions.set(projectRoot, pending);
  return pending;
}

export async function embedSearchQuery(
  embedder: Embedder | null,
  embeddings: boolean,
  query: string,
): Promise<{ queryVec: Float32Array | null; failure: EmbedFailure }> {
  if (!embeddings) return { queryVec: null, failure: "none" };
  if (!embedder) return { queryVec: null, failure: "load" };
  try {
    const queryVec = await embedder.embedQuery(query);
    if (queryVec.length !== EMBEDDING_DIM) return { queryVec: null, failure: "query" };
    return { queryVec, failure: "none" };
  } catch {
    return { queryVec: null, failure: "query" };
  }
}
