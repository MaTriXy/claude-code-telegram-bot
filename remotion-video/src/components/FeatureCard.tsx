import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface FeatureCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  iconBackground?: string;
  animateEntry?: boolean;
  entryDelay?: number;
  entryDirection?: "left" | "right" | "up" | "down";
  highlighted?: boolean;
  highlightColor?: string;
  backgroundColor?: string;
  width?: number | string;
  padding?: number;
  borderRadius?: number;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  icon,
  iconBackground = "#7C3AED",
  animateEntry = true,
  entryDelay = 0,
  entryDirection = "up",
  highlighted = false,
  highlightColor = "#7C3AED",
  backgroundColor = "rgba(255, 255, 255, 0.05)",
  width = 300,
  padding = 24,
  borderRadius = 16,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = animateEntry
    ? spring({
        frame: frame - entryDelay,
        fps,
        config: {
          damping: 15,
          stiffness: 100,
          mass: 0.6,
        },
      })
    : 1;

  const directionMap = {
    left: { x: -50, y: 0 },
    right: { x: 50, y: 0 },
    up: { x: 0, y: 50 },
    down: { x: 0, y: -50 },
  };

  const direction = directionMap[entryDirection];
  const translateX = interpolate(entryProgress, [0, 1], [direction.x, 0]);
  const translateY = interpolate(entryProgress, [0, 1], [direction.y, 0]);
  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const scale = interpolate(entryProgress, [0, 1], [0.95, 1]);

  // Subtle hover-like pulse for highlighted cards
  const pulseScale = highlighted
    ? 1 + Math.sin(frame / 20) * 0.01
    : 1;

  const styles: { [key: string]: React.CSSProperties } = {
    card: {
      width,
      padding,
      backgroundColor,
      borderRadius,
      border: highlighted ? `2px solid ${highlightColor}` : "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: highlighted
        ? `0 8px 32px ${highlightColor}30`
        : "0 4px 20px rgba(0, 0, 0, 0.2)",
      opacity,
      transform: `translate(${translateX}px, ${translateY}px) scale(${scale * pulseScale})`,
      display: "flex",
      flexDirection: "column",
      gap: 16,
    },
    iconContainer: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: iconBackground,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 4px 14px ${iconBackground}40`,
    },
    iconInner: {
      width: 28,
      height: 28,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#FFFFFF",
    },
    content: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
    },
    title: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: 600,
      margin: 0,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    description: {
      color: "rgba(255, 255, 255, 0.6)",
      fontSize: 14,
      lineHeight: 1.5,
      margin: 0,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
  };

  return (
    <div style={styles.card}>
      {icon && (
        <div style={styles.iconContainer}>
          <div style={styles.iconInner}>{icon}</div>
        </div>
      )}
      <div style={styles.content}>
        <h3 style={styles.title}>{title}</h3>
        {description && <p style={styles.description}>{description}</p>}
      </div>
    </div>
  );
};

// Feature card grid layout
interface FeatureGridProps {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
  staggerDelay?: number;
}

export const FeatureGrid: React.FC<FeatureGridProps> = ({
  children,
  columns = 3,
  gap = 24,
}) => {
  const styles: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap,
  };

  return <div style={styles}>{children}</div>;
};

// Compact feature item for lists
interface FeatureItemProps {
  text: string;
  icon?: React.ReactNode;
  checkmark?: boolean;
  animateEntry?: boolean;
  entryDelay?: number;
  color?: string;
}

export const FeatureItem: React.FC<FeatureItemProps> = ({
  text,
  icon,
  checkmark = true,
  animateEntry = true,
  entryDelay = 0,
  color = "#10B981",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = animateEntry
    ? spring({
        frame: frame - entryDelay,
        fps,
        config: {
          damping: 12,
          stiffness: 120,
          mass: 0.5,
        },
      })
    : 1;

  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const translateX = interpolate(entryProgress, [0, 1], [-20, 0]);

  const defaultCheckmark = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={color}>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      opacity,
      transform: `translateX(${translateX}px)`,
    },
    icon: {
      width: 24,
      height: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    text: {
      color: "#FFFFFF",
      fontSize: 16,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.icon}>{icon || (checkmark && defaultCheckmark)}</div>
      <span style={styles.text}>{text}</span>
    </div>
  );
};
