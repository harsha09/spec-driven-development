declare module "fastembed" {
  export const EmbeddingModel: { BGESmallENV15: unknown };
  export const ExecutionProvider: { CPU: unknown };
  export const FlagEmbedding: {
    init(options: {
      model: unknown;
      executionProviders: unknown[];
      maxLength: number;
      showDownloadProgress: boolean;
      cacheDir: string;
    }): Promise<{
      passageEmbed(texts: readonly string[], batchSize: number): AsyncIterable<ArrayLike<number>[]>;
      queryEmbed(text: string): Promise<ArrayLike<number>>;
    }>;
  };
}

declare module "sqlite-vec" {
  export function load(db: unknown): void;
  const sqliteVec: { load(db: unknown): void };
  export default sqliteVec;
}
