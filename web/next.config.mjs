import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const ragServer = process.env.RAG_SERVER_URL || 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: webRoot,
  async rewrites() {
    return [
      {
        source: '/api/nairobi/:path*',
        destination: `${ragServer}/api/nairobi/:path*`,
      },
      {
        source: '/api/rag/:path*',
        destination: `${ragServer}/:path*`,
      },
    ];
  },
};

export default nextConfig;
