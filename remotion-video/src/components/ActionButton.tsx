import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface ActionButtonProps {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline" | "telegram";
  size?: "small" | "medium" | "large";
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  animateEntry?: boolean;
  entryDelay?: number;
  pulse?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  variant = "primary",
  size = "medium",
  icon,
  iconPosition = "left",
  animateEntry = true,
  entryDelay = 0,
  pulse = false,
  disabled = false,
  fullWidth = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = animateEntry
    ? spring({
        frame: frame - entryDelay,
        fps,
        config: {
          damping: 15,
          stiffness: 150,
          mass: 0.5,
        },
      })
    : 1;

  const scale = interpolate(entryProgress, [0, 1], [0.8, 1]);
  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);

  // Pulse animation
  const pulseScale = pulse
    ? 1 + Math.sin((frame - entryDelay) / 10) * 0.03
    : 1;

  const colorMap = {
    primary: {
      background: "#7C3AED",
      text: "#FFFFFF",
      border: "transparent",
    },
    secondary: {
      background: "#3B82F6",
      text: "#FFFFFF",
      border: "transparent",
    },
    outline: {
      background: "transparent",
      text: "#7C3AED",
      border: "#7C3AED",
    },
    telegram: {
      background: "#0088CC",
      text: "#FFFFFF",
      border: "transparent",
    },
  };

  const sizeMap = {
    small: {
      padding: "8px 16px",
      fontSize: 13,
      borderRadius: 8,
      gap: 6,
    },
    medium: {
      padding: "12px 24px",
      fontSize: 15,
      borderRadius: 10,
      gap: 8,
    },
    large: {
      padding: "16px 32px",
      fontSize: 17,
      borderRadius: 12,
      gap: 10,
    },
  };

  const colors = colorMap[variant];
  const sizes = sizeMap[size];

  const styles: { [key: string]: React.CSSProperties } = {
    button: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: iconPosition === "right" ? "row-reverse" : "row",
      gap: sizes.gap,
      padding: sizes.padding,
      backgroundColor: colors.background,
      color: colors.text,
      border: `2px solid ${colors.border}`,
      borderRadius: sizes.borderRadius,
      fontSize: sizes.fontSize,
      fontWeight: 600,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 * opacity : opacity,
      transform: `scale(${scale * pulseScale})`,
      transition: "none",
      width: fullWidth ? "100%" : "auto",
      boxShadow: variant !== "outline"
        ? `0 4px 14px ${colors.background}40`
        : "none",
    },
    icon: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: sizes.fontSize + 4,
      height: sizes.fontSize + 4,
    },
  };

  return (
    <div style={styles.button}>
      {icon && <span style={styles.icon}>{icon}</span>}
      {label}
    </div>
  );
};

// Pre-built Telegram action buttons
export const TelegramActionButtons = {
  Send: () => (
    <ActionButton
      label="Send"
      variant="telegram"
      icon={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z"/>
        </svg>
      }
    />
  ),
  Reply: () => (
    <ActionButton
      label="Reply"
      variant="telegram"
      size="small"
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 9V5L3 12L10 19V14.9C15 14.9 18.5 16.5 21 20C20 15 17 10 10 9Z"/>
        </svg>
      }
    />
  ),
  Forward: () => (
    <ActionButton
      label="Forward"
      variant="outline"
      size="small"
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 15V9H7V5L0 12L7 19V15H14Z" transform="scale(-1,1) translate(-24,0)"/>
        </svg>
      }
    />
  ),
};
