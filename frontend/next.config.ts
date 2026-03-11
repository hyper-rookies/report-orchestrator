import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendNodeModules = path.join(frontendRoot, "node_modules");

const nextConfig: NextConfig = {
  // A parent folder on this machine also has a package.json, so pin resolution
  // to the frontend package instead of relying on the process cwd.
  turbopack: {
    root: frontendRoot,
  },
  webpack: (config) => {
    const existingModules = config.resolve?.modules ?? [];

    config.resolve = {
      ...config.resolve,
      modules: [frontendNodeModules, ...existingModules],
    };

    return config;
  },
};

export default nextConfig;
