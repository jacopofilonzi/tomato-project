import type { MetadataRoute } from "next"

// Forza la generazione statica di questa rotta
export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tomato Project",
    short_name: "Tomato",
    description: "A clean Pomodoro timer to focus and take breaks.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon-512.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
