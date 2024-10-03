const withPWA = require('next-pwa');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    return config;
  },
};

module.exports = withPWA({
  dest: 'public/sw',
  register: true,
  skipWaiting: true,
  scope: '/',
  disable: false,
  buildExcludes: [/middleware-manifest\.json$/],
  publicExcludes: ['!sw/**/*']
})(nextConfig);