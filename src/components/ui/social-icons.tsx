import type { SVGProps } from "react";

/**
 * Iconos de redes sociales en SVG (lucide-react v1 ya no incluye marcas).
 * Usan `currentColor`, así heredan el color del contenedor.
 */

type IconProps = SVGProps<SVGSVGElement>;

export function InstagramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" {...props}>
      <path d="M14.5 8.5h2.2V5.6h-2.5c-2.2 0-3.7 1.5-3.7 3.8v1.7H8.2v3h2.3V21h3.1v-6.9h2.3l.4-3h-2.7V9.6c0-.7.4-1.1 1-1.1Z" />
    </svg>
  );
}

export function YoutubeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="4.5" />
      <path d="m10.2 9.3 4.6 2.7-4.6 2.7V9.3Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TiktokIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" {...props}>
      <path d="M14.5 3v10.8a3.4 3.4 0 1 1-3.4-3.4c.3 0 .6 0 .9.1" strokeLinecap="round" />
      <path d="M14.5 5.4c.5 1.9 2 3.2 4 3.3" strokeLinecap="round" />
    </svg>
  );
}

export function WhatsappIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2 22l5.35-1.4c1.45.79 3.08 1.2 4.7 1.2 5.43 0 9.84-4.4 9.84-9.84C21.9 6.4 17.48 2 12.04 2Zm0 17.94c-1.45 0-2.87-.39-4.11-1.12l-.3-.18-3.05.8.82-2.98-.19-.31a8.1 8.1 0 0 1-1.24-4.31c0-4.48 3.65-8.12 8.13-8.12 4.47 0 8.11 3.64 8.11 8.12 0 4.48-3.64 8.1-8.17 8.1Zm4.5-6.06c-.24-.12-1.46-.72-1.68-.8-.23-.09-.39-.13-.55.12-.16.25-.63.8-.77.96-.14.16-.28.18-.52.06-.24-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.46-1.36-1.7-.14-.25-.02-.38.1-.5.11-.12.25-.28.37-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.75-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.42.06-.63.3-.22.25-.83.81-.83 1.97 0 1.17.85 2.3.97 2.45.12.16 1.67 2.6 4.05 3.64 2.38 1.03 2.38.68 2.81.64.43-.04 1.4-.57 1.6-1.12.19-.55.19-1.02.13-1.12-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}
