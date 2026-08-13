import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile in the user's home directory makes Next infer the wrong
  // workspace root; pin it to this project.
  outputFileTracingRoot: import.meta.dirname,
  // @libsql/client ships native bindings; keep it external to the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
