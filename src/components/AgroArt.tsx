import React from 'react';

export const AgroLogoMark: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
  <div
    className={`${className} rounded-lg bg-gradient-to-br from-emerald-700 to-emerald-900 text-white flex items-center justify-center shrink-0 ring-1 ring-amber-400/30`}
    aria-hidden="true"
  >
    <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
      {/* Fertilizer sack silhouette */}
      <path
        d="M11 8.5C11 7.67 11.67 7 12.5 7H19.5C20.33 7 21 7.67 21 8.5L19.5 11H12.5L11 8.5Z"
        fill="#FBBF24"
        fillOpacity="0.95"
      />
      <path
        d="M9.5 13.5C9.5 11.84 10.84 10.5 12.5 10.5H19.5C21.16 10.5 22.5 11.84 22.5 13.5L23.5 22.5C23.69 24.22 22.34 25.7 20.61 25.7H11.39C9.66 25.7 8.31 24.22 8.5 22.5L9.5 13.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="currentColor"
        fillOpacity="0.14"
      />
      {/* Sprouting rice leaf inside sack */}
      <path
        d="M16 21.5V15.5M16 18.5C16 16.5 18 15 19.8 15C19.8 17 18.2 18.5 16 18.5ZM16 17.5C16 15.8 14.3 14.5 12.6 14.5C12.6 16.3 14 17.5 16 17.5Z"
        stroke="#FDE68A"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

export const AgroPaddyScene: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 800 320"
    preserveAspectRatio="xMidYMid slice"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="agroSky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#064E3B" />
        <stop offset="55%" stopColor="#047857" />
        <stop offset="100%" stopColor="#022C22" />
      </linearGradient>
      <radialGradient id="agroSun" cx="82%" cy="22%" r="42%">
        <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.5" />
        <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#064E3B" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="terrace1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#065F46" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="terrace2" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#047857" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="sackBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FEF3C7" />
        <stop offset="100%" stopColor="#FDE68A" />
      </linearGradient>
    </defs>

    {/* Base sky & sun glow */}
    <rect width="800" height="320" fill="url(#agroSky)" />
    <rect width="800" height="320" fill="url(#agroSun)" />

    {/* Distant misty hills */}
    <path
      d="M0 155 Q140 105 290 142 T590 128 T800 148 L800 320 L0 320 Z"
      fill="#065F46"
      fillOpacity="0.55"
    />

    {/* Rice paddy terraces */}
    <path
      d="M0 190 Q210 155 420 185 T800 175 L800 320 L0 320 Z"
      fill="url(#terrace1)"
      fillOpacity="0.85"
    />
    <path
      d="M0 228 Q260 198 520 226 T800 212 L800 320 L0 320 Z"
      fill="url(#terrace2)"
      fillOpacity="0.9"
    />
    <path
      d="M0 264 Q180 244 390 268 T800 250 L800 320 L0 320 Z"
      fill="#022C22"
      fillOpacity="0.92"
    />

    {/* Terrace contour highlight lines */}
    <path
      d="M0 190 Q210 155 420 185 T800 175"
      fill="none"
      stroke="#A7F3D0"
      strokeOpacity="0.22"
      strokeWidth="1.5"
    />
    <path
      d="M0 228 Q260 198 520 226 T800 212"
      fill="none"
      stroke="#FDE68A"
      strokeOpacity="0.22"
      strokeWidth="1.5"
    />

    {/* Stylized golden paddy stalks on right foreground */}
    <g stroke="#FBBF24" strokeOpacity="0.48" strokeWidth="1.8" strokeLinecap="round" fill="none">
      <path d="M620 318 Q628 250 650 205" />
      <path d="M636 318 Q646 258 672 215" />
      <path d="M654 318 Q664 265 692 224" />
      <path d="M676 318 Q684 272 710 236" />
      <ellipse cx="652" cy="202" rx="4" ry="8" transform="rotate(24 652 202)" fill="#FCD34D" fillOpacity="0.45" />
      <ellipse cx="674" cy="212" rx="4" ry="8" transform="rotate(28 674 212)" fill="#FCD34D" fillOpacity="0.45" />
      <ellipse cx="694" cy="222" rx="3.5" ry="7" transform="rotate(30 694 222)" fill="#FCD34D" fillOpacity="0.45" />
    </g>

    {/* Stacked 50kg subsidized fertilizer sacks silhouette on bottom right */}
    <g transform="translate(658, 222)" opacity="0.9">
      {/* Back sack */}
      <rect x="34" y="18" width="58" height="44" rx="10" fill="#D1FAE5" fillOpacity="0.22" stroke="#A7F3D0" strokeOpacity="0.4" strokeWidth="1.5" />
      {/* Bottom left sack */}
      <rect x="0" y="34" width="66" height="44" rx="10" fill="url(#sackBody)" fillOpacity="0.22" stroke="#FDE68A" strokeOpacity="0.55" strokeWidth="1.5" />
      {/* Bottom right sack */}
      <rect x="52" y="36" width="66" height="42" rx="10" fill="url(#sackBody)" fillOpacity="0.18" stroke="#FDE68A" strokeOpacity="0.45" strokeWidth="1.5" />
      {/* Top center sack */}
      <rect x="24" y="2" width="64" height="42" rx="10" fill="#10B981" fillOpacity="0.28" stroke="#FDE68A" strokeOpacity="0.65" strokeWidth="1.5" />
      {/* Green/amber subsidy stripe across top sack */}
      <line x1="32" y1="22" x2="80" y2="22" stroke="#FBBF24" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  </svg>
);
