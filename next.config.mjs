/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  // Next inlines the Google Fonts stylesheet at build time by default, which
  // makes the build depend on the network reaching fonts.googleapis.com. The
  // browser fetches it perfectly well; the build should not have to.
  optimizeFonts: false,
};
export default nextConfig;
