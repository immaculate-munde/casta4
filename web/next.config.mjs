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
        source: '/api/claims/:path*',
        destination: `${ragServer}/api/claims/:path*`,
      },
      {
        source: '/api/dashboard',
        destination: `${ragServer}/api/dashboard`,
      },
      {
        source: '/api/workspace/:path*',
        destination: `${ragServer}/api/workspace/:path*`,
      },
      {
        source: '/api/cat/:path*',
        destination: `${ragServer}/api/cat/:path*`,
      },
      {
        source: '/api/rag/:path*',
        destination: `${ragServer}/:path*`,
      },
    ];
  },
};

export default nextConfig;
