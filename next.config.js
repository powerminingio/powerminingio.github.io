/** @type {import('next').NextConfig} */
// Served from the GitHub Pages org root (powerminingio.github.io), so there is
// no basePath. The deploy workflow's configure-pages step injects one derived
// from the live Pages URL if that ever stops being true.
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
