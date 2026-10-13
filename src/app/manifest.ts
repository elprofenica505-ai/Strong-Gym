import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description:
      "Gimnasio en Los Cedros, Villa El Carmen: pesas y máquinas, boxeo, bailoterapia y suplementos.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0c0e",
    theme_color: "#d81a22",
    lang: "es",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
