import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to this app; the parent directory is not a workspace root.
  turbopack: { root: path.resolve('.') },
};

export default nextConfig;
