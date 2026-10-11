import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The blank-tee cutout is read from disk when building mockups; make sure it ships with those routes.
  outputFileTracingIncludes: {
    "/api/new-product/*": ["./lib/assets/**/*"],
  },
};

export default nextConfig;
