import React from "react";
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
  primary: "#7C3AED",
  secondary: "#3B82F6",
  background: "#0F0F0F",
  text: "#FFFFFF",
};

// SVG Icon Components
const DeskIcon: React.FC<{ opacity: number }> = ({ opacity }) => (
  <svg width={200} height={150} viewBox="0 0 200 150" style={{ opacity }}>
    {/* Desk surface */}
    <rect x="20" y="80" width="160" height="10" fill="#4B5563" rx="2" />
    {/* Desk legs */}
    <rect x="30" y="90" width="8" height="50" fill="#374151" />
    <rect x="162" y="90" width="8" height="50" fill="#374151" />
    {/* Monitor */}
    <rect x="70" y="30" width="60" height="45" fill="#1F2937" rx="3" />
    <rect x="75" y="35" width="50" height="35" fill={COLORS.secondary} opacity={0.3} />
    <rect x="95" y="75" width="10" height="5" fill="#374151" />
    {/* Keyboard */}
    <rect x="65" y="70" width="40" height="8" fill="#374151" rx="1" />
    {/* Coffee cup */}
    <ellipse cx="150" cy="72" rx="10" ry="4" fill="#6B7280" />
    <rect x="140" y="60" width="20" height="12" fill="#6B7280" rx="2" />
    {/* Chair hint */}
    <rect x="85" y="100" width="30" height="25" fill="#4B5563" rx="3" />
  </svg>
);

const PersonIcon: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <svg
    width={60}
    height={100}
    viewBox="0 0 60 100"
    style={{
      transform: `translate(${x}px, ${y}px)`,
      opacity,
    }}
  >
    {/* Head */}
    <circle cx="30" cy="15" r="12" fill={COLORS.text} />
    {/* Body */}
    <ellipse cx="30" cy="45" rx="15" ry="20" fill={COLORS.primary} />
    {/* Arms */}
    <rect x="8" y="35" width="8" height="25" fill={COLORS.primary} rx="4" />
    <rect x="44" y="35" width="8" height="25" fill={COLORS.primary} rx="4" />
    {/* Legs */}
    <rect x="20" y="63" width="8" height="30" fill="#374151" rx="3" />
    <rect x="32" y="63" width="8" height="30" fill="#374151" rx="3" />
  </svg>
);

const PhoneIcon: React.FC<{ x: number; y: number; opacity: number; scale?: number }> = ({
  x,
  y,
  opacity,
  scale = 1,
}) => (
  <svg
    width={24 * scale}
    height={40 * scale}
    viewBox="0 0 24 40"
    style={{
      transform: `translate(${x}px, ${y}px)`,
      opacity,
    }}
  >
    <rect x="0" y="0" width="24" height="40" fill="#1F2937" rx="4" />
    <rect x="2" y="4" width="20" height="32" fill={COLORS.secondary} opacity={0.5} />
    <circle cx="12" cy="38" r="2" fill="#374151" />
  </svg>
);

const GlobeIcon: React.FC<{ rotation: number; scale: number; opacity: number }> = ({
  rotation,
  scale,
  opacity,
}) => (
  <svg
    width={180}
    height={180}
    viewBox="0 0 180 180"
    style={{
      transform: `scale(${scale}) rotate(${rotation}deg)`,
      opacity,
      transformOrigin: "center center",
    }}
  >
    {/* Globe circle */}
    <circle cx="90" cy="90" r="80" fill="none" stroke={COLORS.secondary} strokeWidth="3" />
    {/* Latitude lines */}
    <ellipse cx="90" cy="90" rx="80" ry="30" fill="none" stroke={COLORS.secondary} strokeWidth="1.5" opacity={0.6} />
    <ellipse cx="90" cy="90" rx="80" ry="55" fill="none" stroke={COLORS.secondary} strokeWidth="1.5" opacity={0.6} />
    {/* Longitude lines */}
    <ellipse cx="90" cy="90" rx="30" ry="80" fill="none" stroke={COLORS.secondary} strokeWidth="1.5" opacity={0.6} />
    <ellipse cx="90" cy="90" rx="55" ry="80" fill="none" stroke={COLORS.secondary} strokeWidth="1.5" opacity={0.6} />
    {/* Center meridian */}
    <line x1="90" y1="10" x2="90" y2="170" stroke={COLORS.secondary} strokeWidth="1.5" opacity={0.6} />
    {/* Equator */}
    <line x1="10" y1="90" x2="170" y2="90" stroke={COLORS.secondary} strokeWidth="1.5" opacity={0.6} />
    {/* Gradient overlay for 3D effect */}
    <defs>
      <radialGradient id="globeGradient" cx="30%" cy="30%">
        <stop offset="0%" stopColor={COLORS.secondary} stopOpacity="0.2" />
        <stop offset="100%" stopColor={COLORS.primary} stopOpacity="0.1" />
      </radialGradient>
    </defs>
    <circle cx="90" cy="90" r="78" fill="url(#globeGradient)" />
  </svg>
);

const CoffeeShopIcon: React.FC<{ scale: number; opacity: number }> = ({ scale, opacity }) => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 40 40"
    style={{ transform: `scale(${scale})`, opacity }}
  >
    <circle cx="20" cy="20" r="18" fill={COLORS.primary} opacity={0.8} />
    {/* Coffee cup */}
    <rect x="12" y="14" width="12" height="14" fill={COLORS.text} rx="2" />
    <path d="M24 17 C28 17, 28 25, 24 25" stroke={COLORS.text} strokeWidth="2" fill="none" />
    {/* Steam */}
    <path d="M15 12 Q16 8, 15 6" stroke={COLORS.text} strokeWidth="1.5" fill="none" opacity={0.7} />
    <path d="M19 11 Q20 7, 19 5" stroke={COLORS.text} strokeWidth="1.5" fill="none" opacity={0.7} />
  </svg>
);

const BusIcon: React.FC<{ scale: number; opacity: number }> = ({ scale, opacity }) => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 40 40"
    style={{ transform: `scale(${scale})`, opacity }}
  >
    <circle cx="20" cy="20" r="18" fill={COLORS.secondary} opacity={0.8} />
    {/* Bus body */}
    <rect x="8" y="14" width="24" height="14" fill={COLORS.text} rx="2" />
    {/* Windows */}
    <rect x="10" y="16" width="6" height="6" fill={COLORS.secondary} rx="1" />
    <rect x="18" y="16" width="6" height="6" fill={COLORS.secondary} rx="1" />
    <rect x="26" y="16" width="4" height="6" fill={COLORS.secondary} rx="1" />
    {/* Wheels */}
    <circle cx="13" cy="28" r="3" fill="#374151" />
    <circle cx="27" cy="28" r="3" fill="#374151" />
  </svg>
);

const HomeIcon: React.FC<{ scale: number; opacity: number }> = ({ scale, opacity }) => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 40 40"
    style={{ transform: `scale(${scale})`, opacity }}
  >
    <circle cx="20" cy="20" r="18" fill={COLORS.primary} opacity={0.6} />
    {/* House roof */}
    <path d="M20 8 L32 18 L8 18 Z" fill={COLORS.text} />
    {/* House body */}
    <rect x="11" y="18" width="18" height="14" fill={COLORS.text} />
    {/* Door */}
    <rect x="17" y="22" width="6" height="10" fill={COLORS.secondary} />
    {/* Window */}
    <rect x="24" y="21" width="4" height="4" fill={COLORS.secondary} />
  </svg>
);

const ComputerIcon: React.FC<{ opacity: number; pulse: number }> = ({ opacity, pulse }) => (
  <svg
    width={50}
    height={45}
    viewBox="0 0 50 45"
    style={{ opacity }}
  >
    {/* Monitor */}
    <rect x="5" y="0" width="40" height="30" fill="#1F2937" rx="3" />
    <rect
      x="8"
      y="3"
      width="34"
      height="24"
      fill={COLORS.secondary}
      opacity={0.3 + pulse * 0.2}
    />
    {/* Stand */}
    <rect x="20" y="30" width="10" height="5" fill="#374151" />
    <rect x="15" y="35" width="20" height="3" fill="#374151" rx="1" />
    {/* Screen glow */}
    <rect x="8" y="3" width="34" height="24" fill={COLORS.primary} opacity={pulse * 0.15} />
  </svg>
);

// Connection line with pulse animation
const ConnectionLine: React.FC<{
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  pulseProgress: number;
}> = ({ startX, startY, endX, endY, progress, pulseProgress }) => {
  const lineLength = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
  const dashOffset = lineLength * (1 - progress);

  // Calculate pulse position along the line
  const pulseX = startX + (endX - startX) * pulseProgress;
  const pulseY = startY + (endY - startY) * pulseProgress;

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
    >
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.primary} />
          <stop offset="100%" stopColor={COLORS.secondary} />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Main line */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke="url(#lineGradient)"
        strokeWidth="3"
        strokeDasharray={lineLength}
        strokeDashoffset={dashOffset}
        filter="url(#glow)"
        opacity={progress}
      />
      {/* Pulse dot */}
      {progress > 0.5 && (
        <circle
          cx={pulseX}
          cy={pulseY}
          r={6}
          fill={COLORS.text}
          filter="url(#glow)"
          opacity={0.9}
        />
      )}
    </svg>
  );
};

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ===== ANIMATION TIMINGS =====
  // Phase 1: Desk visible with text (0-60)
  // Phase 2: Desk fades, person walks off (60-100)
  // Phase 3: Globe appears and spins (100-130)
  // Phase 4: Location icons pop in (120-150)
  // Phase 5: Connection pulses (140-180)

  // Animation 1: Fade desk (frames 60-90)
  const deskOpacity = interpolate(
    frame,
    [0, 30, 60, 90],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  // Animation 2: Person walks off screen with phone (frames 60-100)
  const personStartX = 0;
  const personEndX = 400;
  const walkProgress = interpolate(
    frame,
    [60, 100],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const personX = personStartX + (personEndX - personStartX) * walkProgress;
  const personOpacity = interpolate(
    frame,
    [0, 30, 60, 95, 100],
    [0, 1, 1, 1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  // Phone follows person
  const phoneX = personX + 45;
  const phoneY = 30;
  const phoneOpacity = interpolate(
    frame,
    [50, 60, 95, 100],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  // Animation 3: Globe appears and spins (frames 100-end)
  const globeEntryProgress = spring({
    frame: frame - 100,
    fps,
    config: {
      damping: 12,
      stiffness: 80,
      mass: 1,
    },
  });
  const globeScale = interpolate(globeEntryProgress, [0, 1], [0, 1]);
  const globeOpacity = interpolate(globeEntryProgress, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });
  const globeRotation = interpolate(
    frame,
    [100, durationInFrames],
    [0, 360],
    { extrapolateLeft: "clamp" }
  );

  // Animation 4: Location icons pop in (frames 120-150)
  const coffeePopProgress = spring({
    frame: frame - 120,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.5 },
  });
  const busPopProgress = spring({
    frame: frame - 130,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.5 },
  });
  const homePopProgress = spring({
    frame: frame - 140,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.5 },
  });

  // Animation 5: Connection line pulse (frames 140-end)
  const connectionProgress = interpolate(
    frame,
    [140, 160],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Continuous pulse animation
  const pulsePhase = ((frame - 160) / 30) % 1;
  const pulseProgress = frame > 160 ? pulsePhase : 0;

  // Computer pulse for glow effect
  const computerPulse = Math.sin(((frame - 150) / fps) * Math.PI * 3) * 0.5 + 0.5;

  // Text timing
  const text1Visible = frame >= 10 && frame < 70;
  const text2Visible = frame >= 70 && frame < 130;
  const text3Visible = frame >= 130;

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
      {/* Text Layer */}
      <div
        style={{
          position: "absolute",
          top: "8%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        {text1Visible && (
          <AnimatedText
            text="Stuck at your desk to code?"
            animation="fadeIn"
            delay={10}
            fontSize={48}
            fontWeight={600}
            color={COLORS.text}
            textAlign="center"
          />
        )}
        {text2Visible && (
          <AnimatedText
            text="What if you could control Claude Code..."
            animation="slideUp"
            delay={70}
            fontSize={42}
            fontWeight={600}
            color={COLORS.text}
            textAlign="center"
          />
        )}
        {text3Visible && (
          <AnimatedText
            text="...from anywhere?"
            animation="slideUp"
            delay={130}
            fontSize={48}
            fontWeight={700}
            color={COLORS.primary}
            textAlign="center"
          />
        )}
      </div>

      {/* Phase 1 & 2: Desk and Person */}
      <div
        style={{
          position: "absolute",
          top: "35%",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <DeskIcon opacity={deskOpacity} />
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 70,
          }}
        >
          <PersonIcon x={personX} y={0} opacity={personOpacity} />
          <PhoneIcon x={phoneX} y={phoneY} opacity={phoneOpacity} scale={0.8} />
        </div>
      </div>

      {/* Phase 3, 4, 5: Globe with icons and connection */}
      {frame > 100 && (
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
          <GlobeIcon
            rotation={globeRotation * 0.1}
            scale={globeScale}
            opacity={globeOpacity}
          />

          {/* Location icons positioned around globe */}
          <div
            style={{
              position: "absolute",
              top: -30,
              left: 140,
            }}
          >
            <CoffeeShopIcon scale={coffeePopProgress} opacity={coffeePopProgress} />
          </div>
          <div
            style={{
              position: "absolute",
              top: 60,
              left: -50,
            }}
          >
            <BusIcon scale={busPopProgress} opacity={busPopProgress} />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: -30,
              right: -40,
            }}
          >
            <HomeIcon scale={homePopProgress} opacity={homePopProgress} />
          </div>
        </div>
      )}

      {/* Phone and Computer with connection line */}
      {frame > 140 && (
        <>
          {/* Phone icon (left side) */}
          <div
            style={{
              position: "absolute",
              bottom: "15%",
              left: "20%",
              opacity: connectionProgress,
            }}
          >
            <PhoneIcon x={0} y={0} opacity={1} scale={2} />
          </div>

          {/* Computer icon (right side) */}
          <div
            style={{
              position: "absolute",
              bottom: "15%",
              right: "20%",
              opacity: connectionProgress,
            }}
          >
            <ComputerIcon opacity={1} pulse={computerPulse} />
          </div>

          {/* Connection line */}
          <ConnectionLine
            startX={250}
            startY={520}
            endX={550}
            endY={520}
            progress={connectionProgress}
            pulseProgress={pulseProgress}
          />
        </>
      )}
    </AbsoluteFill>
  );
};
