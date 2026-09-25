/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // `pg` and `better-auth` are Node-only and must not be bundled by webpack.
    // They are used exclusively in Node-runtime route handlers.
    serverComponentsExternalPackages: ["pg", "better-auth"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
};

export default nextConfig;
