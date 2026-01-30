import React from "react";
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
  cardBackground: "#1A1A1A",
  cardBorder: "rgba(255, 255, 255, 0.1)",
};

// Feature data
interface Feature {
  id: number;
  title: string;
  description: string;
  startFrame: number;
  endFrame: number;
  iconType: "folder" | "voice" | "buttons" | "git";
}

const FEATURES: Feature[] = [
  {
    id: 1,
    title: "Multi-Project Sessions",
    description: "Switch between projects instantly. Keep context for each workspace.",
    startFrame: 0,
    endFrame: 90,
    iconType: "folder",
  },
  {
    id: 2,
    title: "Voice Messages & File Uploads",
    description: "Send voice notes or drop files directly into the conversation.",
    startFrame: 90,
    endFrame: 180,
    iconType: "voice",
  },
  {
    id: 3,
    title: "Interactive Q&A Buttons",
    description: "Approve, reject, or modify with a single tap. Full control.",
    startFrame: 180,
    endFrame: 270,
    iconType: "buttons",
  },
  {
    id: 4,
    title: "Git Operations On-The-Go",
    description: "Commit, push, and manage branches from anywhere.",
    startFrame: 270,
    endFrame: 360,
    iconType: "git",
  },
];

// ==================== CUSTOM SVG ICONS ====================

// Folder Icons for Multi-Project feature
const FolderIcons: React.FC<{
  progress: number;
  floatOffset: number;
}> = ({ progress, floatOffset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cascade animation for multiple folders
  const folders = [
    { x: -30, y: -20, delay: 0, color: COLORS.primary, scale: 1 },
    { x: 0, y: 0, delay: 5, color: COLORS.secondary, scale: 1.1 },
    { x: 30, y: 20, delay: 10, color: "#10B981", scale: 0.9 },
  ];

  return (
    <div style={{ position: "relative", width: 120, height: 80 }}>
      {folders.map((folder, index) => {
        const cascadeProgress = spring({
          frame: progress * 30 - folder.delay,
          fps,
          config: { damping: 12, stiffness: 100, mass: 0.5 },
        });

        const opacity = interpolate(cascadeProgress, [0, 1], [0, 1]);
        const translateY = interpolate(cascadeProgress, [0, 1], [-30, 0]);
        const floatY = Math.sin((frame + index * 10) / 15) * 3 * floatOffset;

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${folder.x}px), calc(-50% + ${folder.y + translateY + floatY}px)) scale(${folder.scale})`,
              opacity,
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill={folder.color}>
              <path d="M10 4H4C2.89 4 2.01 4.89 2.01 6L2 18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V8C22 6.89 21.11 6 20 6H12L10 4Z" />
            </svg>
          </div>
        );
      })}
    </div>
  );
};

// Voice & File Icons
const VoiceFileIcons: React.FC<{
  progress: number;
  floatOffset: number;
}> = ({ progress, floatOffset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Microphone cascade
  const micProgress = spring({
    frame: progress * 30,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
  });

  // File icon cascade
  const fileProgress = spring({
    frame: progress * 30 - 8,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
  });

  const micFloat = Math.sin(frame / 12) * 4 * floatOffset;
  const fileFloat = Math.sin((frame + 15) / 12) * 4 * floatOffset;

  return (
    <div style={{ position: "relative", width: 120, height: 80, display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
      {/* Microphone */}
      <div
        style={{
          transform: `translateY(${micFloat}px)`,
          opacity: micProgress,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill={COLORS.primary}>
          <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z" />
          <path d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z" />
        </svg>
        {/* Sound waves */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "100%",
            transform: "translateY(-50%)",
            display: "flex",
            gap: 2,
          }}
        >
          {[0, 1, 2].map((i) => {
            const waveOpacity = interpolate(
              Math.sin((frame + i * 5) / 8),
              [-1, 1],
              [0.3, 1]
            );
            return (
              <div
                key={i}
                style={{
                  width: 3,
                  height: 8 + i * 4,
                  backgroundColor: COLORS.primary,
                  borderRadius: 2,
                  opacity: waveOpacity * floatOffset,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* File upload icon */}
      <div
        style={{
          transform: `translateY(${fileFloat}px)`,
          opacity: fileProgress,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill={COLORS.secondary}>
          <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20ZM8 15.01L9.41 16.42L11 14.84V19H13V14.84L14.59 16.43L16 15.01L12.01 11L8 15.01Z" />
        </svg>
      </div>
    </div>
  );
};

// Interactive Buttons Icons
const ButtonIcons: React.FC<{
  progress: number;
  floatOffset: number;
}> = ({ progress, floatOffset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const buttons = [
    { label: "Accept", color: "#10B981", delay: 0 },
    { label: "Reject", color: "#EF4444", delay: 5 },
    { label: "Modify", color: "#F59E0B", delay: 10 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      {buttons.map((button, index) => {
        const btnProgress = spring({
          frame: progress * 30 - button.delay,
          fps,
          config: { damping: 12, stiffness: 120, mass: 0.4 },
        });

        const opacity = interpolate(btnProgress, [0, 1], [0, 1]);
        const translateX = interpolate(btnProgress, [0, 1], [50, 0]);
        const scale = interpolate(btnProgress, [0, 1], [0.8, 1]);

        // Pulse animation
        const pulseScale = 1 + Math.sin((frame + index * 10) / 10) * 0.05 * floatOffset;

        return (
          <div
            key={index}
            style={{
              padding: "8px 20px",
              backgroundColor: `${button.color}20`,
              borderRadius: 8,
              border: `2px solid ${button.color}`,
              color: button.color,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 14,
              fontWeight: 600,
              opacity,
              transform: `translateX(${translateX}px) scale(${scale * pulseScale})`,
              boxShadow: `0 0 ${10 + Math.sin((frame + index * 10) / 10) * 5}px ${button.color}40`,
            }}
          >
            {button.label}
          </div>
        );
      })}
    </div>
  );
};

// Git Branch Icons with animated drawing
const GitBranchIcons: React.FC<{
  progress: number;
  floatOffset: number;
}> = ({ progress, floatOffset }) => {
  const frame = useCurrentFrame();

  // Branch line draw animation
  const drawProgress = interpolate(progress, [0, 0.6], [0, 1], {
    extrapolateRight: "clamp",
  });

  const floatY = Math.sin(frame / 15) * 3 * floatOffset;

  // Path lengths for stroke-dasharray animation
  const mainBranchLength = 80;
  const sideBranchLength = 40;

  return (
    <div
      style={{
        position: "relative",
        width: 120,
        height: 100,
        transform: `translateY(${floatY}px)`,
      }}
    >
      <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
        {/* Main branch line */}
        <path
          d="M30 90 L30 10"
          stroke={COLORS.primary}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={mainBranchLength}
          strokeDashoffset={mainBranchLength * (1 - drawProgress)}
        />

        {/* Side branch */}
        <path
          d="M30 50 Q50 50 70 30"
          stroke={COLORS.secondary}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={sideBranchLength}
          strokeDashoffset={sideBranchLength * (1 - Math.max(0, (drawProgress - 0.3) / 0.7))}
        />

        {/* Merge branch */}
        <path
          d="M70 30 Q90 30 90 50 L90 70"
          stroke="#10B981"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={sideBranchLength}
          strokeDashoffset={sideBranchLength * (1 - Math.max(0, (drawProgress - 0.5) / 0.5))}
        />

        {/* Commit dots */}
        {[
          { x: 30, y: 80, delay: 0.1, color: COLORS.primary },
          { x: 30, y: 50, delay: 0.3, color: COLORS.primary },
          { x: 70, y: 30, delay: 0.5, color: COLORS.secondary },
          { x: 30, y: 20, delay: 0.6, color: COLORS.primary },
          { x: 90, y: 50, delay: 0.7, color: "#10B981" },
          { x: 90, y: 70, delay: 0.9, color: "#10B981" },
        ].map((dot, index) => {
          const dotOpacity = interpolate(
            drawProgress,
            [dot.delay, dot.delay + 0.15],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const dotScale = interpolate(
            drawProgress,
            [dot.delay, dot.delay + 0.15],
            [0.5, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <circle
              key={index}
              cx={dot.x}
              cy={dot.y}
              r={6}
              fill={dot.color}
              opacity={dotOpacity}
              transform={`scale(${dotScale})`}
              style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
            />
          );
        })}
      </svg>
    </div>
  );
};

// ==================== FEATURE CARD COMPONENT ====================

interface FeatureCardProps {
  feature: Feature;
  isActive: boolean;
  entryProgress: number;
  exitProgress: number;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  feature,
  isActive,
  entryProgress,
  exitProgress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Card slide-in from right animation
  const slideProgress = spring({
    frame: entryProgress,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1 },
  });

  // Card swipe-out to left animation
  const swipeProgress = spring({
    frame: exitProgress,
    fps,
    config: { damping: 15, stiffness: 100, mass: 0.8 },
  });

  const translateX = interpolate(slideProgress, [0, 1], [400, 0]) +
    interpolate(swipeProgress, [0, 1], [0, -400]);

  const opacity = interpolate(slideProgress, [0, 0.3], [0, 1]) *
    interpolate(swipeProgress, [0, 0.7], [1, 0]);

  const scale = interpolate(slideProgress, [0, 1], [0.9, 1]) *
    interpolate(swipeProgress, [0, 1], [1, 0.9]);

  // Float offset for icons (1 when active, 0 when exiting)
  const floatOffset = interpolate(swipeProgress, [0, 0.3], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Icon animation progress
  const iconProgress = interpolate(slideProgress, [0.3, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title animation
  const titleProgress = spring({
    frame: entryProgress - 10,
    fps,
    config: { damping: 15, stiffness: 100, mass: 0.5 },
  });

  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);
  const titleY = interpolate(titleProgress, [0, 1], [20, 0]);

  // Description animation
  const descProgress = spring({
    frame: entryProgress - 20,
    fps,
    config: { damping: 15, stiffness: 100, mass: 0.5 },
  });

  const descOpacity = interpolate(descProgress, [0, 1], [0, 1]);
  const descY = interpolate(descProgress, [0, 1], [15, 0]);

  // Render the appropriate icon
  const renderIcon = () => {
    switch (feature.iconType) {
      case "folder":
        return <FolderIcons progress={iconProgress} floatOffset={floatOffset} />;
      case "voice":
        return <VoiceFileIcons progress={iconProgress} floatOffset={floatOffset} />;
      case "buttons":
        return <ButtonIcons progress={iconProgress} floatOffset={floatOffset} />;
      case "git":
        return <GitBranchIcons progress={iconProgress} floatOffset={floatOffset} />;
      default:
        return null;
    }
  };

  // Subtle glow animation
  const glowIntensity = isActive ? Math.sin(frame / 20) * 0.3 + 0.7 : 0.5;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) translateX(${translateX}px) scale(${scale})`,
        opacity,
        width: 420,
        padding: 40,
        backgroundColor: COLORS.cardBackground,
        borderRadius: 24,
        border: `1px solid ${COLORS.cardBorder}`,
        boxShadow: `0 20px 60px rgba(0, 0, 0, 0.5), 0 0 ${40 * glowIntensity}px ${COLORS.primary}20`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
      }}
    >
      {/* Icon container */}
      <div
        style={{
          width: 140,
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          background: `linear-gradient(135deg, ${COLORS.primary}15 0%, ${COLORS.secondary}15 100%)`,
        }}
      >
        {renderIcon()}
      </div>

      {/* Title */}
      <h2
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: COLORS.text,
          margin: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {feature.title}
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: 16,
          color: "rgba(255, 255, 255, 0.7)",
          margin: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 320,
          opacity: descOpacity,
          transform: `translateY(${descY}px)`,
        }}
      >
        {feature.description}
      </p>
    </div>
  );
};

// ==================== PROGRESS INDICATOR ====================

const ProgressIndicator: React.FC<{
  currentFeature: number;
  totalFeatures: number;
}> = ({ currentFeature, totalFeatures }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 12,
      }}
    >
      {Array.from({ length: totalFeatures }).map((_, index) => {
        const isActive = index === currentFeature;
        const isPast = index < currentFeature;
        const pulseScale = isActive ? 1 + Math.sin(frame / 10) * 0.1 : 1;

        return (
          <div
            key={index}
            style={{
              width: isActive ? 32 : 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isActive
                ? COLORS.primary
                : isPast
                ? COLORS.secondary
                : "rgba(255, 255, 255, 0.2)",
              transform: `scale(${pulseScale})`,
              transition: "width 0.3s ease, background-color 0.3s ease",
              boxShadow: isActive ? `0 0 12px ${COLORS.primary}` : "none",
            }}
          />
        );
      })}
    </div>
  );
};

// ==================== MAIN SCENE COMPONENT ====================

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Determine which feature is active
  const getCurrentFeatureIndex = (): number => {
    for (let i = FEATURES.length - 1; i >= 0; i--) {
      if (frame >= FEATURES[i].startFrame) {
        return i;
      }
    }
    return 0;
  };

  const currentFeatureIndex = getCurrentFeatureIndex();

  // Scene title animation
  const titleOpacity = interpolate(
    frame,
    [0, 20, durationInFrames - 20, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const titleY = interpolate(
    frame,
    [0, 30],
    [-20, 0],
    { extrapolateRight: "clamp" }
  );

  // Exit transition
  const exitProgress = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
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
      {/* Background gradient */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          background: `radial-gradient(ellipse at 50% 30%, ${COLORS.primary}10 0%, transparent 50%)`,
        }}
      />

      {/* Decorative background particles */}
      <BackgroundParticles />

      {/* Scene title */}
      <div
        style={{
          position: "absolute",
          top: 60,
          width: "100%",
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <h1
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: COLORS.text,
            margin: 0,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.secondary})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Powerful Features
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "rgba(255, 255, 255, 0.6)",
            marginTop: 8,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Everything you need to code from anywhere
        </p>
      </div>

      {/* Feature cards */}
      {FEATURES.map((feature, index) => {
        // Calculate entry and exit progress for each card
        const entryStart = feature.startFrame;
        const exitStart = feature.endFrame - 15;

        const entryProgress = Math.max(0, frame - entryStart);
        const exitProgress = Math.max(0, frame - exitStart);

        const isActive = index === currentFeatureIndex;
        const shouldRender = frame >= entryStart - 10 && frame <= feature.endFrame + 10;

        if (!shouldRender) return null;

        return (
          <FeatureCard
            key={feature.id}
            feature={feature}
            isActive={isActive}
            entryProgress={entryProgress}
            exitProgress={exitProgress}
          />
        );
      })}

      {/* Progress indicator */}
      <ProgressIndicator
        currentFeature={currentFeatureIndex}
        totalFeatures={FEATURES.length}
      />

      {/* Corner accents */}
      <CornerAccents frame={frame} />
    </AbsoluteFill>
  );
};

// ==================== BACKGROUND PARTICLES ====================

const BackgroundParticles: React.FC = () => {
  const frame = useCurrentFrame();

  const particles = React.useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 3,
      speed: 0.5 + Math.random() * 1,
      opacity: 0.1 + Math.random() * 0.2,
    }));
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {particles.map((particle) => {
        const y = (particle.y + (frame * particle.speed) / 10) % 120 - 10;
        const floatX = Math.sin((frame + particle.id * 20) / 30) * 10;

        return (
          <div
            key={particle.id}
            style={{
              position: "absolute",
              left: `${particle.x}%`,
              top: `${y}%`,
              width: particle.size,
              height: particle.size,
              borderRadius: "50%",
              backgroundColor: COLORS.primary,
              opacity: particle.opacity,
              transform: `translateX(${floatX}px)`,
            }}
          />
        );
      })}
    </div>
  );
};

// ==================== CORNER ACCENTS ====================

const CornerAccents: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = interpolate(frame, [0, 30], [0, 0.3], {
    extrapolateRight: "clamp",
  });

  return (
    <>
      <svg
        width="80"
        height="80"
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          opacity,
        }}
      >
        <path
          d="M0 40 L0 0 L40 0"
          stroke={COLORS.primary}
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <svg
        width="80"
        height="80"
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          opacity,
          transform: "scaleX(-1)",
        }}
      >
        <path
          d="M0 40 L0 0 L40 0"
          stroke={COLORS.secondary}
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <svg
        width="80"
        height="80"
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          opacity,
          transform: "scaleY(-1)",
        }}
      >
        <path
          d="M0 40 L0 0 L40 0"
          stroke={COLORS.secondary}
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <svg
        width="80"
        height="80"
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          opacity,
          transform: "scale(-1, -1)",
        }}
      >
        <path
          d="M0 40 L0 0 L40 0"
          stroke={COLORS.primary}
          strokeWidth="2"
          fill="none"
        />
      </svg>
    </>
  );
};
