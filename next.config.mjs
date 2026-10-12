import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing-page.html" }],
    };
  },
  webpack(config) {
    config.resolve.alias["@"] = __dirname;
    return config;
  },
};

export default nextConfig;
