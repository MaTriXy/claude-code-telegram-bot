import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface ProgressBarProps {
  progress?: number;
  animateProgress?: boolean;
  startDelay?: number;
  duration?: number;
  height?: number;
  width?: number | string;
  backgroundColor?: string;
  progressColor?: string;
  gradientColors?: [string, string];
  showPercentage?: boolean;
  label?: string;
  rounded?: boolean;
  striped?: boolean;
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress = 100,
  animateProgress = true,
  startDelay = 0,
  duration = 60,
  height = 8,
  width = "100%",
  backgroundColor = "rgba(255, 255, 255, 0.1)",
  progressColor,
  gradientColors = ["#7C3AED", "#3B82F6"],
  showPercentage = false,
  label,
  rounded = true,
  striped = false,
  animated = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - startDelay);

  // Animated progress
  const animatedProgress = animateProgress
    ? interpolate(
        delayedFrame,
        [0, duration],
        [0, progress],
        {
          extrapolateRight: "clamp",
        }
      )
    : progress;

  // Entry animation
  const entryProgress = spring({
    frame: delayedFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
      mass: 0.5,
    },
  });

  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const scaleX = interpolate(entryProgress, [0, 1], [0.8, 1]);

  // Stripe animation offset
  const stripeOffset = animated ? (frame % 40) * -1 : 0;

  const gradientBackground = progressColor
    ? progressColor
    : `linear-gradient(90deg, ${gradientColors[0]}, ${gradientColors[1]})`;

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      width,
      opacity,
      transform: `scaleX(${scaleX})`,
      transformOrigin: "left center",
    },
    labelContainer: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    label: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: 500,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    percentage: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: 600,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    track: {
      width: "100%",
      height,
      backgroundColor,
      borderRadius: rounded ? height / 2 : 0,
      overflow: "hidden",
      position: "relative" as const,
    },
    fill: {
      width: `${animatedProgress}%`,
      height: "100%",
      background: gradientBackground,
      borderRadius: rounded ? height / 2 : 0,
      position: "relative" as const,
      overflow: "hidden",
    },
    stripes: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.15) 25%,
        transparent 25%,
        transparent 50%,
        rgba(255, 255, 255, 0.15) 50%,
        rgba(255, 255, 255, 0.15) 75%,
        transparent 75%,
        transparent
      )`,
      backgroundSize: "20px 20px",
      transform: `translateX(${stripeOffset}px)`,
    },
    glow: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      width: 20,
      height: "100%",
      background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3))",
      borderRadius: rounded ? height / 2 : 0,
    },
  };

  return (
    <div style={styles.container}>
      {(label || showPercentage) && (
        <div style={styles.labelContainer}>
          {label && <span style={styles.label}>{label}</span>}
          {showPercentage && (
            <span style={styles.percentage}>{Math.round(animatedProgress)}%</span>
          )}
        </div>
      )}
      <div style={styles.track}>
        <div style={styles.fill}>
          {striped && <div style={styles.stripes} />}
          <div style={styles.glow} />
        </div>
      </div>
    </div>
  );
};

// Circular progress variant
interface CircularProgressProps {
  progress?: number;
  animateProgress?: boolean;
  startDelay?: number;
  duration?: number;
  size?: number;
  strokeWidth?: number;
  backgroundColor?: string;
  progressColor?: string;
  showPercentage?: boolean;
  label?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress = 100,
  animateProgress = true,
  startDelay = 0,
  duration = 60,
  size = 100,
  strokeWidth = 8,
  backgroundColor = "rgba(255, 255, 255, 0.1)",
  progressColor = "#7C3AED",
  showPercentage = true,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - startDelay);

  const animatedProgress = animateProgress
    ? interpolate(
        delayedFrame,
        [0, duration],
        [0, progress],
        {
          extrapolateRight: "clamp",
        }
      )
    : progress;

  const entryProgress = spring({
    frame: delayedFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
      mass: 0.5,
    },
  });

  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const scale = interpolate(entryProgress, [0, 1], [0.8, 1]);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference;

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      position: "relative" as const,
      width: size,
      height: size,
      opacity,
      transform: `scale(${scale})`,
    },
    svg: {
      transform: "rotate(-90deg)",
    },
    center: {
      position: "absolute" as const,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      textAlign: "center" as const,
    },
    percentage: {
      color: "#FFFFFF",
      fontSize: size * 0.25,
      fontWeight: 700,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    label: {
      color: "rgba(255, 255, 255, 0.6)",
      fontSize: size * 0.12,
      fontWeight: 500,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      marginTop: 4,
    },
  };

  return (
    <div style={styles.container}>
      <svg width={size} height={size} style={styles.svg}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div style={styles.center}>
        {showPercentage && (
          <div style={styles.percentage}>{Math.round(animatedProgress)}%</div>
        )}
        {label && <div style={styles.label}>{label}</div>}
      </div>
    </div>
  );
};
