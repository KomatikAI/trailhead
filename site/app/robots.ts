import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trailhead.komatik.xyz";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/welcome", "/dashboard", "/dashboard-embed.html"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
