/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['twilio'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
