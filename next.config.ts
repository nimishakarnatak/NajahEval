import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repository is nested inside a larger local workspace that has its own
  // lockfile. Pinning the root keeps dependency and file tracing deterministic.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // The bundled 300-episode CSV is read only by server code. Explicit tracing
  // ensures Netlify includes it in the generated serverless function bundle.
  outputFileTracingIncludes: {
    "/*": ["./data/najah_final_annotation_dataset.csv"],
  },
};

export default nextConfig;
