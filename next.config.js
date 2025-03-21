/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  },
  experimental: {
    webVitalsAttribution: ['CLS', 'LCP'],
  }
}

module.exports = nextConfig 