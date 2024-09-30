const withPWA = require('next-pwa')({
  dest: 'public',
  disable: false,
  register: true,
  skipWaiting: true,
  scope: '/'
})

module.exports = withPWA({
  reactStrictMode: true,
  swcMinify: true,
  output: 'export', // Dies ersetzt 'next export'
})