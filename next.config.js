import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  outputFileTracingRoot: __dirname,
  exportPathMap: async function (defaultPathMap, { dev, outDir, distDir }) {
    if (outDir) {
      delete defaultPathMap['/game/[activeGameId]'];
      delete defaultPathMap['/groups/[groupId]'];
      delete defaultPathMap['/tournaments/[tournamentId]'];
      delete defaultPathMap['/profile/[playerId]'];
      delete defaultPathMap['/view/session/[sessionId]'];
      delete defaultPathMap['/view/tournament/[tournamentId]'];
      delete defaultPathMap['/view/session/public/[sessionId]'];
      delete defaultPathMap['/support/[articleId]'];
    }
    return {
      ...defaultPathMap,
      '/features': { page: '/features' },
    }
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh4.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh5.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh6.googleusercontent.com',
      },
    ],
  },
  webpack: (config) => {
    return config;
  },
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

