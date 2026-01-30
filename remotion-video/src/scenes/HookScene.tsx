import React, { useMemo } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
} from "remotion";
import { PhoneMockup } from "../components/PhoneMockup";
import { AnimatedText } from "../components/AnimatedText";

// Color palette
const COLORS = {
  primary: "#7C3AED",
  background: "#0F0F0F",
  text: "#FFFFFF",
};

// Generate sparkle particles with random positions
interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

const generateSparkles = (count: number): Sparkle[] => {
  const sparkles: Sparkle[] = [];
  for (let i = 0; i < count; i++) {
    sparkles.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 60,
      duration: 20 + Math.random() * 40,
    });
  }
  return sparkles;
};

// Claude Logo Component with pulse animation
const ClaudeLogo: React.FC<{ pulse: number }> = ({ pulse }) => {
  const glowIntensity = interpolate(pulse, [0, 1], [0.3, 0.8]);
  const logoScale = interpolate(pulse, [0, 1], [1, 1.05]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        transform: `scale(${logoScale})`,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Glow effect */}
        <div
          style={{
            position: "absolute",
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${COLORS.primary}${Math.round(glowIntensity * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
            filter: `blur(${20 + glowIntensity * 10}px)`,
          }}
        />
        {/* Logo SVG */}
        <svg width={80} height={80} viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke={COLORS.primary}
            strokeWidth="2"
            opacity={0.8}
          />
          <circle cx="12" cy="12" r="6" fill={COLORS.primary} />
          <circle cx="12" cy="12" r="3" fill="white" />
        </svg>
      </div>
    </div>
  );
};

// Sparkle Particle Component
const SparkleParticle: React.FC<{
  sparkle: Sparkle;
  frame: number;
  phoneVisible: boolean;
}> = ({ sparkle, frame, phoneVisible }) => {
  if (!phoneVisible) return null;

  const cycleFrame = (frame - sparkle.delay) % (sparkle.duration * 2);
  const progress =
    cycleFrame < sparkle.duration
      ? cycleFrame / sparkle.duration
      : 1 - (cycleFrame - sparkle.duration) / sparkle.duration;

  const opacity = interpolate(
    progress,
    [0, 0.3, 0.7, 1],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp" }
  );

  const scale = interpolate(progress, [0, 0.5, 1], [0.5, 1.2, 0.5], {
    extrapolateRight: "clamp",
  });

  // Position sparkles around the phone (in the center area)
  const centerX = 50;
  const centerY = 45;
  const spreadX = 35;
  const spreadY = 45;

  const x = centerX + (sparkle.x - 50) * (spreadX / 50);
  const y = centerY + (sparkle.y - 50) * (spreadY / 50);

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: sparkle.size,
        height: sparkle.size,
        borderRadius: "50%",
        backgroundColor: COLORS.text,
        opacity: opacity * 0.8,
        transform: `translate(-50%, -50%) scale(${scale})`,
        boxShadow: `0 0 ${sparkle.size * 2}px ${COLORS.primary}`,
        pointerEvents: "none",
      }}
    />
  );
};

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Generate sparkles once
  const sparkles = useMemo(() => generateSparkles(20), []);

  // Animation 1: Fade from black (frames 0-30)
  const fadeInProgress = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Animation 2: Phone slides up (frames 15-60)
  const phoneEntryProgress = spring({
    frame: frame - 15,
    fps,
    config: {
      damping: 12,
      stiffness: 80,
      mass: 1,
    },
  });

  const phoneTranslateY = interpolate(
    phoneEntryProgress,
    [0, 1],
    [400, 0],
    { extrapolateRight: "clamp" }
  );

  const phoneOpacity = interpolate(
    phoneEntryProgress,
    [0, 0.3],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  // Animation 3: Logo pulse (continuous after phone arrives, frame 50+)
  const pulsePhase = Math.sin(((frame - 50) / fps) * Math.PI * 2) * 0.5 + 0.5;
  const logoVisible = frame > 40;

  // Animation 4: Text timing
  const text1Delay = 30; // First text appears after fade-in
  const text2Delay = 70; // Second text appears later

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
        opacity: fadeInProgress * exitProgress,
      }}
    >
      {/* Sparkle particles layer */}
      <AbsoluteFill>
        {sparkles.map((sparkle) => (
          <SparkleParticle
            key={sparkle.id}
            sparkle={sparkle}
            frame={frame}
            phoneVisible={frame > 30}
          />
        ))}
      </AbsoluteFill>

      {/* Main content container */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        {/* Top text */}
        <div
          style={{
            position: "absolute",
            top: "8%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AnimatedText
            text="Your AI coding assistant..."
            animation="fadeIn"
            delay={text1Delay}
            fontSize={48}
            fontWeight={600}
            color={COLORS.text}
            textAlign="center"
          />
          <AnimatedText
            text="...in your pocket."
            animation="slideUp"
            delay={text2Delay}
            fontSize={48}
            fontWeight={600}
            color={COLORS.primary}
            textAlign="center"
          />
        </div>

        {/* Phone with Claude logo */}
        <div
          style={{
            transform: `translateY(${phoneTranslateY}px)`,
            opacity: phoneOpacity,
            marginTop: 80,
          }}
        >
          <PhoneMockup
            scale={0.7}
            showNotch={true}
            frameColor="#1F2937"
            screenColor={COLORS.background}
          >
            {/* Claude logo inside phone */}
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 50,
              }}
            >
              {logoVisible && <ClaudeLogo pulse={pulsePhase} />}
            </div>
          </PhoneMockup>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
