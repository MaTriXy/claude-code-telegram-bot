import React, { useMemo } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
} from "remotion";

// Color palette
const COLORS = {
  primary: "#7C3AED",
  secondary: "#3B82F6",
  background: "#0F0F0F",
  text: "#FFFFFF",
  accent: "#10B981",
};

// ==================== STAR ICON ====================

const StarIcon: React.FC<{
  size?: number;
  color?: string;
  filled?: boolean;
}> = ({ size = 32, color = "#FBBF24", filled = true }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
);

// ==================== FORK ICON ====================

const ForkIcon: React.FC<{
  size?: number;
  color?: string;
}> = ({ size = 32, color = COLORS.secondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="6" r="3" />
    <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
    <path d="M12 12v3" />
  </svg>
);

// ==================== DEPLOY ICON (ROCKET) ====================

const DeployIcon: React.FC<{
  size?: number;
  color?: string;
}> = ({ size = 32, color = COLORS.accent }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19ZM5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5ZM21.61 2.39C21.61 2.39 16.66 0.269 11 5.93C8.81 8.12 7.5 10.53 6.65 12.64C6.37 13.39 6.56 14.21 7.11 14.77L9.24 16.89C9.79 17.45 10.61 17.63 11.36 17.35C13.5 16.53 15.88 15.19 18.07 13C23.73 7.34 21.61 2.39 21.61 2.39ZM14.54 9.46C13.76 8.68 13.76 7.41 14.54 6.63C15.32 5.85 16.59 5.85 17.37 6.63C18.14 7.41 18.15 8.68 17.37 9.46C16.59 10.24 15.32 10.24 14.54 9.46ZM8.88 16.53L7.47 15.12L8.88 16.53ZM6.24 22L9.88 18.36C9.54 18.27 9.21 18.12 8.91 17.91L4.83 22H6.24ZM2 22H3.41L8.18 17.24L6.76 15.83L2 20.59V22ZM2 19.17L6.09 15.09C5.88 14.79 5.73 14.46 5.64 14.12L2 17.76V19.17Z" />
  </svg>
);

// ==================== QR CODE PIXEL GRID ====================

interface QRPixel {
  row: number;
  col: number;
  delay: number;
}

// Create a simplified QR code-like pattern
const generateQRPattern = (): QRPixel[] => {
  const pixels: QRPixel[] = [];
  const size = 11; // 11x11 grid

  // QR code-like pattern (simplified)
  const pattern = [
    [1,1,1,1,1,1,1,0,1,1,1],
    [1,0,0,0,0,0,1,0,1,0,1],
    [1,0,1,1,1,0,1,0,0,1,0],
    [1,0,1,1,1,0,1,0,1,0,1],
    [1,0,1,1,1,0,1,0,1,1,0],
    [1,0,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1],
    [0,0,0,0,0,0,0,0,1,1,0],
    [1,1,0,1,1,0,1,1,1,0,1],
    [0,1,1,0,1,0,0,0,0,1,1],
    [1,1,1,1,1,1,1,0,1,1,1],
  ];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (pattern[row][col] === 1) {
        // Delay based on distance from center for a spiral-like effect
        const distFromCenter = Math.sqrt(Math.pow(row - 5, 2) + Math.pow(col - 5, 2));
        const delay = distFromCenter * 2 + Math.random() * 5;
        pixels.push({ row, col, delay });
      }
    }
  }

  return pixels;
};

const QRCodeAssembly: React.FC<{
  progress: number;
  size: number;
}> = ({ progress, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pixels = useMemo(() => generateQRPattern(), []);
  const pixelSize = size / 11;
  const gap = 2;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        backgroundColor: COLORS.text,
        borderRadius: 8,
        padding: pixelSize * 0.5,
        boxShadow: `0 0 30px ${COLORS.primary}40`,
      }}
    >
      {pixels.map((pixel, index) => {
        const pixelProgress = spring({
          frame: progress * 50 - pixel.delay,
          fps,
          config: { damping: 15, stiffness: 200, mass: 0.3 },
        });

        const opacity = interpolate(pixelProgress, [0, 1], [0, 1]);
        const scale = interpolate(pixelProgress, [0, 1], [0, 1]);

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: pixel.col * pixelSize + gap,
              top: pixel.row * pixelSize + gap,
              width: pixelSize - gap * 2,
              height: pixelSize - gap * 2,
              backgroundColor: COLORS.background,
              borderRadius: 2,
              opacity,
              transform: `scale(${scale})`,
            }}
          />
        );
      })}
    </div>
  );
};

// ==================== BOUNCING ACTION BUTTON ====================

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  delay: number;
  color: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bounce in animation
  const bounceProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 8, stiffness: 100, mass: 0.8 },
  });

  const opacity = interpolate(bounceProgress, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scale = interpolate(bounceProgress, [0, 1], [0.3, 1]);
  const translateY = interpolate(bounceProgress, [0, 1], [50, 0]);

  // Subtle hover-like pulse
  const pulseScale = 1 + Math.sin((frame - delay) / 15) * 0.05;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale * pulseScale})`,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          backgroundColor: `${color}20`,
          border: `2px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 20px ${color}40`,
        }}
      >
        {icon}
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: COLORS.text,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {label}
      </span>
    </div>
  );
};

// ==================== GLOWING LOGO ====================

const GlowingLogo: React.FC<{
  progress: number;
}> = ({ progress }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: progress,
    fps,
    config: { damping: 12, stiffness: 80, mass: 1 },
  });

  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const scale = interpolate(entryProgress, [0, 1], [0.5, 1]);

  // Pulsing glow effect
  const glowIntensity = 0.5 + Math.sin(frame / 10) * 0.3;
  const glowSize = 30 + Math.sin(frame / 8) * 10;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {/* Logo with glow */}
      <div style={{ position: "relative" }}>
        {/* Glow layers */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${COLORS.primary}${Math.round(glowIntensity * 100).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
            filter: `blur(${glowSize}px)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${COLORS.secondary}${Math.round(glowIntensity * 80).toString(16).padStart(2, '0')} 0%, transparent 60%)`,
            filter: `blur(${glowSize * 0.7}px)`,
          }}
        />

        {/* Logo SVG */}
        <svg width={50} height={50} viewBox="0 0 24 24" fill="none" style={{ position: "relative", zIndex: 1 }}>
          <circle cx="12" cy="12" r="10" stroke={COLORS.primary} strokeWidth="2" />
          <circle cx="12" cy="12" r="6" fill={COLORS.primary} />
          <circle cx="12" cy="12" r="3" fill="white" />
        </svg>
      </div>

      {/* Telegram text */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg width={32} height={32} viewBox="0 0 24 24" fill="#0088CC">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.38 15.84 14.22 15.51 15.99C15.37 16.74 15.09 16.99 14.83 17.02C14.25 17.07 13.81 16.64 13.25 16.27C12.37 15.69 11.87 15.33 11.02 14.77C10.03 14.12 10.67 13.76 11.24 13.18C11.39 13.03 13.95 10.7 14 10.49C14.0069 10.4582 14.006 10.4252 13.9973 10.3938C13.9886 10.3624 13.9724 10.3337 13.95 10.31C13.89 10.26 13.81 10.28 13.74 10.29C13.65 10.31 12.25 11.24 9.52 13.08C9.12 13.35 8.76 13.49 8.44 13.48C8.08 13.47 7.4 13.28 6.89 13.11C6.26 12.91 5.77 12.8 5.81 12.45C5.83 12.27 6.08 12.09 6.55 11.9C9.47 10.63 11.41 9.79 12.38 9.39C15.16 8.23 15.73 8.03 16.11 8.03C16.19 8.03 16.38 8.05 16.5 8.15C16.6 8.23 16.63 8.34 16.64 8.42C16.63 8.48 16.65 8.66 16.64 8.8Z" />
        </svg>
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: COLORS.text,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Claude Code Bot
        </span>
      </div>
    </div>
  );
};

// ==================== MAIN CTA SCENE ====================

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Timeline calculations
  const HEADLINE_START = 0;
  const HEADLINE_END = 45;
  const URL_START = 45;
  const URL_END = 75;
  const ICONS_START = 75;
  const ICONS_END = 120;
  const QR_START = 90;
  const QR_END = 140;
  const LOGO_START = 120;
  const LOGO_END = 150;
  const FADE_START = 150;
  const FADE_END = 180;

  // ========== HEADLINE ANIMATION (Scale-up) ==========
  const headlineProgress = spring({
    frame: frame - HEADLINE_START,
    fps,
    config: { damping: 12, stiffness: 60, mass: 1.2 },
  });

  const headlineScale = interpolate(headlineProgress, [0, 1], [0.3, 1]);
  const headlineOpacity = interpolate(headlineProgress, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // ========== URL FADE-IN ==========
  const urlProgress = spring({
    frame: frame - URL_START,
    fps,
    config: { damping: 15, stiffness: 100, mass: 0.5 },
  });

  const urlOpacity = interpolate(urlProgress, [0, 1], [0, 1]);
  const urlTranslateY = interpolate(urlProgress, [0, 1], [20, 0]);

  // ========== QR CODE PROGRESS ==========
  const qrProgress = interpolate(
    frame,
    [QR_START, QR_END],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ========== LOGO PROGRESS ==========
  const logoProgress = Math.max(0, frame - LOGO_START);

  // ========== FADE TO BLACK ==========
  const fadeToBlack = interpolate(
    frame,
    [FADE_START, FADE_END],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
      }}
    >
      {/* Background gradient */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          background: `radial-gradient(ellipse at 50% 30%, ${COLORS.primary}15 0%, transparent 60%)`,
        }}
      />

      {/* Main content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        {/* Hero headline: "Code from anywhere." */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `scale(${headlineScale})`,
            marginBottom: 20,
          }}
        >
          <h1
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: COLORS.text,
              margin: 0,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              textAlign: "center",
              background: `linear-gradient(135deg, ${COLORS.text} 0%, ${COLORS.primary} 50%, ${COLORS.secondary} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: -1,
            }}
          >
            Code from anywhere.
          </h1>
        </div>

        {/* GitHub URL */}
        <div
          style={{
            opacity: urlOpacity,
            transform: `translateY(${urlTranslateY}px)`,
            marginBottom: 50,
          }}
        >
          <p
            style={{
              fontSize: 24,
              fontWeight: 500,
              color: COLORS.secondary,
              margin: 0,
              fontFamily: "'SF Mono', 'Consolas', 'Monaco', monospace",
              textAlign: "center",
              letterSpacing: 0.5,
            }}
          >
            github.com/Benihakak/claude-code-telegram-bot
          </p>
        </div>

        {/* Action buttons row */}
        <div
          style={{
            display: "flex",
            gap: 60,
            marginBottom: 50,
          }}
        >
          <ActionButton
            icon={<StarIcon size={32} color="#FBBF24" />}
            label="Star"
            delay={ICONS_START}
            color="#FBBF24"
          />
          <ActionButton
            icon={<ForkIcon size={32} color={COLORS.secondary} />}
            label="Fork"
            delay={ICONS_START + 10}
            color={COLORS.secondary}
          />
          <ActionButton
            icon={<DeployIcon size={32} color={COLORS.accent} />}
            label="Deploy"
            delay={ICONS_START + 20}
            color={COLORS.accent}
          />
        </div>

        {/* Bottom section: QR code and Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 80,
            marginTop: 20,
          }}
        >
          {/* QR Code */}
          <div
            style={{
              opacity: interpolate(qrProgress, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            <QRCodeAssembly progress={qrProgress} size={120} />
          </div>

          {/* Glowing Logo */}
          <GlowingLogo progress={logoProgress} />
        </div>
      </AbsoluteFill>

      {/* Corner accents */}
      <CornerAccents frame={frame} />

      {/* Fade to black overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#000000",
          opacity: fadeToBlack,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

// ==================== CORNER ACCENTS ====================

const CornerAccents: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = interpolate(frame, [0, 30], [0, 0.4], {
    extrapolateRight: "clamp",
  });

  // Fade out with the scene
  const fadeOpacity = interpolate(frame, [150, 170], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <svg
        width="100"
        height="100"
        style={{
          position: "absolute",
          top: 30,
          left: 30,
          opacity: opacity * fadeOpacity,
        }}
      >
        <path
          d="M0 50 L0 0 L50 0"
          stroke={COLORS.primary}
          strokeWidth="3"
          fill="none"
        />
      </svg>
      <svg
        width="100"
        height="100"
        style={{
          position: "absolute",
          top: 30,
          right: 30,
          opacity: opacity * fadeOpacity,
          transform: "scaleX(-1)",
        }}
      >
        <path
          d="M0 50 L0 0 L50 0"
          stroke={COLORS.secondary}
          strokeWidth="3"
          fill="none"
        />
      </svg>
      <svg
        width="100"
        height="100"
        style={{
          position: "absolute",
          bottom: 30,
          left: 30,
          opacity: opacity * fadeOpacity,
          transform: "scaleY(-1)",
        }}
      >
        <path
          d="M0 50 L0 0 L50 0"
          stroke={COLORS.accent}
          strokeWidth="3"
          fill="none"
        />
      </svg>
      <svg
        width="100"
        height="100"
        style={{
          position: "absolute",
          bottom: 30,
          right: 30,
          opacity: opacity * fadeOpacity,
          transform: "scale(-1, -1)",
        }}
      >
        <path
          d="M0 50 L0 0 L50 0"
          stroke={COLORS.primary}
          strokeWidth="3"
          fill="none"
        />
      </svg>
    </>
  );
};
