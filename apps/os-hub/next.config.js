/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  // These packages use dynamic require() that webpack can't statically analyze.
  // They're server-only (puppeteer runs in API routes) so skip bundling them.
  serverExternalPackages: [
    "puppeteer-core",
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
  ],
};

module.exports = nextConfig;
