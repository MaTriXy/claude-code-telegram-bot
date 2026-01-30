import React, { useMemo } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
} from "remotion";
import { AnimatedText } from "../components/AnimatedText";

// Color palette
const COLORS = {
  primary: "#7C3AED", // Claude/Purple
  secondary: "#3B82F6", // Blue
  telegram: "#0088CC", // Telegram blue
  background: "#0F0F0F",
  text: "#FFFFFF",
};

// Particle interface for assembly effect
interface Particle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  size: number;
  delay: number;
  color: string;
}

// Generate particles for logo assembly effect
const generateParticles = (count: number): Particle[] => {
  const particles: Particle[] = [];
  const colors = [COLORS.primary, COLORS.telegram, COLORS.secondary, COLORS.text];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 150 + Math.random() * 100;
    particles.push({
      id: i,
      startX: Math.cos(angle) * radius,
      startY: Math.sin(angle) * radius,
      endX: (Math.random() - 0.5) * 60,
      endY: (Math.random() - 0.5) * 60,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 20,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  return particles;
};

// Telegram Icon (Paper Plane)
const TelegramIconSVG: React.FC<{
  size: number;
  x: number;
  opacity: number;
  scale: number;
  glow: number;
}> = ({ size, x, opacity, scale, glow }) => (
  <div
    style={{
      position: "absolute",
      transform: `translateX(${x}px) scale(${scale})`,
      opacity,
    }}
  >
    {/* Glow effect */}
    <div
      style={{
        position: "absolute",
        width: size * 1.5,
        height: size * 1.5,
        top: -size * 0.25,
        left: -size * 0.25,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${COLORS.telegram}${Math.round(glow * 180).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
        filter: `blur(${15 + glow * 15}px)`,
      }}
    />
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Outer circle */}
      <circle cx="24" cy="24" r="22" fill={COLORS.telegram} />
      {/* Paper plane */}
      <path
        d="M32.5 15.5L14 22.5L19.5 25L22 32L26 27L31 31L32.5 15.5Z"
        fill={COLORS.text}
      />
      <path
        d="M19.5 25L22 32L23.5 27L32.5 15.5L19.5 25Z"
        fill={COLORS.text}
        opacity={0.8}
      />
    </svg>
  </div>
);

// Claude Icon (Stylized "C" logo)
const ClaudeIconSVG: React.FC<{
  size: number;
  x: number;
  opacity: number;
  scale: number;
  glow: number;
}> = ({ size, x, opacity, scale, glow }) => (
  <div
    style={{
      position: "absolute",
      transform: `translateX(${x}px) scale(${scale})`,
      opacity,
    }}
  >
    {/* Glow effect */}
    <div
      style={{
        position: "absolute",
        width: size * 1.5,
        height: size * 1.5,
        top: -size * 0.25,
        left: -size * 0.25,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${COLORS.primary}${Math.round(glow * 180).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
        filter: `blur(${15 + glow * 15}px)`,
      }}
    />
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Outer circle */}
      <circle cx="24" cy="24" r="22" fill={COLORS.primary} />
      {/* Inner design - Claude style */}
      <circle cx="24" cy="24" r="14" fill={COLORS.background} />
      <circle cx="24" cy="24" r="8" fill={COLORS.primary} />
      <circle cx="24" cy="24" r="4" fill={COLORS.text} />
    </svg>
  </div>
);

// Merged Logo Component
const MergedLogo: React.FC<{
  size: number;
  opacity: number;
  scale: number;
  glow: number;
}> = ({ size, opacity, scale, glow }) => (
  <div
    style={{
      position: "relative",
      opacity,
      transform: `scale(${scale})`,
    }}
  >
    {/* Intense glow when merged */}
    <div
      style={{
        position: "absolute",
        width: size * 2,
        height: size * 2,
        top: -size * 0.5,
        left: -size * 0.5,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${COLORS.primary}${Math.round(glow * 200).toString(16).padStart(2, "0")} 0%, ${COLORS.telegram}${Math.round(glow * 150).toString(16).padStart(2, "0")} 40%, transparent 70%)`,
        filter: `blur(${20 + glow * 25}px)`,
      }}
    />
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Gradient background circle */}
      <defs>
        <linearGradient id="mergedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={COLORS.telegram} />
          <stop offset="50%" stopColor={COLORS.primary} />
          <stop offset="100%" stopColor={COLORS.secondary} />
        </linearGradient>
        <filter id="logoGlow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="40" cy="40" r="38" fill="url(#mergedGradient)" filter="url(#logoGlow)" />
      {/* Combined icon - paper plane + AI core */}
      <circle cx="40" cy="40" r="25" fill={COLORS.background} />
      {/* Paper plane silhouette */}
      <path
        d="M52 28L28 38L36 42L40 52L46 44L54 50L52 28Z"
        fill={COLORS.text}
        opacity={0.9}
      />
      {/* AI core dot */}
      <circle cx="40" cy="40" r="6" fill={COLORS.primary} />
      <circle cx="40" cy="40" r="3" fill={COLORS.text} />
    </svg>
  </div>
);

// Particle Component for assembly effect
const ParticleComponent: React.FC<{
  particle: Particle;
  progress: number;
  visible: boolean;
}> = ({ particle, progress, visible }) => {
  if (!visible) return null;

  const delayedProgress = Math.max(0, (progress - particle.delay / 40));
  const clampedProgress = Math.min(1, delayedProgress * 1.5);

  // Eased progress for smooth animation
  const easedProgress = 1 - Math.pow(1 - clampedProgress, 3);

  const x = particle.startX + (particle.endX - particle.startX) * easedProgress;
  const y = particle.startY + (particle.endY - particle.startY) * easedProgress;

  const opacity = interpolate(
    clampedProgress,
    [0, 0.3, 0.8, 1],
    [0, 1, 1, 0.3],
    { extrapolateRight: "clamp" }
  );

  const scale = interpolate(
    clampedProgress,
    [0, 0.5, 1],
    [1.5, 1, 0.5],
    { extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        width: particle.size,
        height: particle.size,
        borderRadius: "50%",
        backgroundColor: particle.color,
        opacity,
        boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
        pointerEvents: "none",
      }}
    />
  );
};

// Typewriter Text Component with custom styling
const TypewriterText: React.FC<{
  text: string;
  startFrame: number;
  duration: number;
  fontSize: number;
  color: string;
}> = ({ text, startFrame, duration, fontSize, color }) => {
  const frame = useCurrentFrame();
  const delayedFrame = Math.max(0, frame - startFrame);

  const progress = interpolate(
    delayedFrame,
    [0, duration],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const visibleChars = Math.floor(progress * text.length);
  const visibleText = text.slice(0, visibleChars);
  const cursorOpacity = Math.sin(frame / 4) > 0 ? 1 : 0;
  const showCursor = delayedFrame > 0 && delayedFrame < duration + 30;

  return (
    <p
      style={{
        fontSize,
        fontWeight: 500,
        color,
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        margin: 0,
        letterSpacing: "0.02em",
      }}
    >
      {visibleText}
      {showCursor && <span style={{ opacity: cursorOpacity, color: COLORS.primary }}>|</span>}
    </p>
  );
};

export const SolutionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Generate particles once
  const particles = useMemo(() => generateParticles(40), []);

  // ===== ANIMATION TIMINGS =====
  // Phase 1: "Introducing" fades in (0-45)
  // Phase 2: Icons slide from sides (30-75)
  // Phase 3: Icons merge with glow (75-105)
  // Phase 4: Logo assembles with particles (105-140)
  // Phase 5: Tagline types in (130-170)

  // Animation 1: "Introducing" fade in (frames 0-45)
  const introducingOpacity = interpolate(
    frame,
    [0, 30, 45, 75],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  const introducingScale = spring({
    frame,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
      mass: 0.8,
    },
  });

  // Animation 2: Icons slide from sides (frames 30-75)
  const iconSlideProgress = spring({
    frame: frame - 30,
    fps,
    config: {
      damping: 18,
      stiffness: 80,
      mass: 1,
    },
  });

  // Telegram icon slides from left
  const telegramX = interpolate(iconSlideProgress, [0, 1], [-300, -60], {
    extrapolateRight: "clamp",
  });

  // Claude icon slides from right
  const claudeX = interpolate(iconSlideProgress, [0, 1], [300, 60], {
    extrapolateRight: "clamp",
  });

  const iconOpacity = interpolate(
    frame,
    [30, 45, 70, 80],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const iconScale = interpolate(iconSlideProgress, [0, 1], [0.8, 1], {
    extrapolateRight: "clamp",
  });

  // Animation 3: Merge glow effect (frames 75-105)
  const mergeProgress = interpolate(
    frame,
    [75, 90],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const mergeGlow = interpolate(
    frame,
    [75, 85, 95, 105],
    [0, 1, 1, 0.5],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Animation 4: Particle assembly (frames 90-140)
  const particleProgress = interpolate(
    frame,
    [90, 130],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const particlesVisible = frame > 90 && frame < 145;

  // Final logo appearance (frames 105+)
  const logoEntryProgress = spring({
    frame: frame - 100,
    fps,
    config: {
      damping: 12,
      stiffness: 100,
      mass: 0.8,
    },
  });

  const logoScale = interpolate(logoEntryProgress, [0, 1], [0.5, 1], {
    extrapolateRight: "clamp",
  });

  const logoOpacity = interpolate(
    frame,
    [100, 115],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Continuous gentle pulse on final logo
  const logoPulse = frame > 115 ? Math.sin(((frame - 115) / fps) * Math.PI * 2) * 0.1 + 0.6 : 0;

  // Animation 5: Product name appears (frames 115-150)
  const productNameOpacity = interpolate(
    frame,
    [115, 130],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const productNameY = interpolate(
    spring({
      frame: frame - 115,
      fps,
      config: { damping: 15, stiffness: 100, mass: 0.6 },
    }),
    [0, 1],
    [20, 0]
  );

  // Tagline typewriter starts at frame 135
  const taglineStartFrame = 135;

  // Exit transition (last 15 frames)
  const exitStart = durationInFrames - 15;
  const exitProgress = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        opacity: exitProgress,
      }}
    >
      {/* Background subtle gradient */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          background: `radial-gradient(circle at 50% 50%, ${COLORS.primary}15 0%, transparent 60%)`,
        }}
      />

      {/* Phase 1: "Introducing" text */}
      <div
        style={{
          position: "absolute",
          top: "25%",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: introducingOpacity,
          transform: `scale(${interpolate(introducingScale, [0, 1], [0.9, 1])})`,
        }}
      >
        <AnimatedText
          text="Introducing"
          animation="fadeIn"
          delay={0}
          fontSize={56}
          fontWeight={300}
          color={COLORS.text}
          textAlign="center"
          style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}
        />
      </div>

      {/* Phase 2 & 3: Icons sliding and merging */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 400,
          height: 120,
        }}
      >
        {/* Telegram icon from left */}
        {frame < 85 && (
          <TelegramIconSVG
            size={80}
            x={telegramX}
            opacity={iconOpacity}
            scale={iconScale}
            glow={mergeGlow}
          />
        )}

        {/* Claude icon from right */}
        {frame < 85 && (
          <ClaudeIconSVG
            size={80}
            x={claudeX}
            opacity={iconOpacity}
            scale={iconScale}
            glow={mergeGlow}
          />
        )}
      </div>

      {/* Phase 4: Particle assembly effect */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 400,
          height: 400,
        }}
      >
        {particles.map((particle) => (
          <ParticleComponent
            key={particle.id}
            particle={particle}
            progress={particleProgress}
            visible={particlesVisible}
          />
        ))}
      </div>

      {/* Merged/Final Logo */}
      {frame > 80 && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MergedLogo
            size={100}
            opacity={logoOpacity}
            scale={logoScale + (logoPulse * 0.05)}
            glow={logoPulse}
          />
        </div>
      )}

      {/* Phase 5: Product name */}
      {frame > 115 && (
        <div
          style={{
            position: "absolute",
            top: "58%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            opacity: productNameOpacity,
            transform: `translateY(${productNameY}px)`,
          }}
        >
          <h1
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: COLORS.text,
              margin: 0,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              background: `linear-gradient(135deg, ${COLORS.telegram} 0%, ${COLORS.primary} 50%, ${COLORS.secondary} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Claude Code Telegram Bot
          </h1>

          {/* Tagline with typewriter effect */}
          <div style={{ marginTop: 8 }}>
            <TypewriterText
              text="Remote CLI access. Zero friction."
              startFrame={taglineStartFrame}
              duration={50}
              fontSize={24}
              color="rgba(255, 255, 255, 0.8)"
            />
          </div>
        </div>
      )}

      {/* Decorative corner accents */}
      <svg
        width="100"
        height="100"
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          opacity: interpolate(frame, [0, 30], [0, 0.3], { extrapolateRight: "clamp" }),
        }}
      >
        <path
          d="M0 50 L0 0 L50 0"
          stroke={COLORS.primary}
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <svg
        width="100"
        height="100"
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          opacity: interpolate(frame, [0, 30], [0, 0.3], { extrapolateRight: "clamp" }),
          transform: "rotate(180deg)",
        }}
      >
        <path
          d="M0 50 L0 0 L50 0"
          stroke={COLORS.secondary}
          strokeWidth="2"
          fill="none"
        />
      </svg>
    </AbsoluteFill>
  );
};
