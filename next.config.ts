import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg and the local embedding model (native onnxruntime) must not be bundled by webpack
  serverExternalPackages: ["pg", "@huggingface/transformers", "onnxruntime-node", "sharp"],
  poweredByHeader: false,
};

export default nextConfig;
