// Local, offline sentence embeddings: Xenova/all-MiniLM-L6-v2 (384-d) via @huggingface/transformers.
// The SAME functions are used by the Next.js server (query + on-write embedding) and by
// scripts/embed-incidents.ts (batch), so every vector in the database is comparable.
// Plain TypeScript (no path aliases, no server-only import) so Node can run it directly.
import path from "node:path";
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

// Model files are downloaded once (~90 MB) into the git-ignored .cache/ folder.
env.cacheDir = path.join(process.cwd(), ".cache", "transformers");

// One pipeline per process (globalThis survives Next.js dev hot reloads).
const g = globalThis as unknown as { __igEmbedder?: Promise<FeatureExtractionPipeline> };

export function getEmbedder(): Promise<FeatureExtractionPipeline> {
  g.__igEmbedder ??= (pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "fp32" }) as Promise<FeatureExtractionPipeline>)
    .catch((e) => {
      g.__igEmbedder = undefined; // let a later call retry the load
      throw e;
    });
  return g.__igEmbedder;
}

/** Embed one text: mean pooling + L2 normalisation → 384 numbers. */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  const v = Array.from(out.data as Float32Array);
  if (v.length !== EMBEDDING_DIM) throw new Error(`expected ${EMBEDDING_DIM} dimensions, got ${v.length}`);
  return v;
}

/** pgvector text literal, e.g. "[0.1,0.2,...]" — pass as a parameter and cast with ::vector. */
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;

/** The text that represents an incident: title + description + root cause + resolution (empty parts skipped). */
export function incidentText(i: { title: string; description?: string | null; root_cause?: string | null; resolution?: string | null }) {
  return [i.title, i.description, i.root_cause, i.resolution]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(". ");
}
