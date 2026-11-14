/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/admin/database-backups/**/*": ["./vendor/postgresql-17/**/*"],
  },
};

export default nextConfig;
