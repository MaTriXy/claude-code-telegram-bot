import React from "react";
import { useCurrentFrame, interpolate, useVideoConfig } from "remotion";

interface TypingIndicatorProps {
  show?: boolean;
  showDelay?: number;
  botName?: string;
  backgroundColor?: string;
  dotColor?: string;
  showAvatar?: boolean;
  avatarEmoji?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  show = true,
  showDelay = 0,
  botName = "Claude Bot",
  backgroundColor = "#2B2B2B",
  dotColor = "#FFFFFF",
  showAvatar = true,
  avatarEmoji = "🤖",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - showDelay);

  if (!show || delayedFrame <= 0) {
    return null;
  }

  // Opacity animation for appearing
  const opacity = interpolate(delayedFrame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Create staggered dot animations
  const cycleDuration = fps * 0.6; // 0.6 second cycle
  const cycleFrame = delayedFrame % cycleDuration;

  const dot1Y = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.25, cycleDuration * 0.5, cycleDuration],
    [0, -6, 0, 0]
  );
  const dot2Y = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.125, cycleDuration * 0.375, cycleDuration * 0.625, cycleDuration],
    [0, 0, -6, 0, 0]
  );
  const dot3Y = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.25, cycleDuration * 0.5, cycleDuration * 0.75, cycleDuration],
    [0, 0, 0, -6, 0]
  );

  const dot1Opacity = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.25, cycleDuration * 0.5, cycleDuration],
    [0.4, 1, 0.4, 0.4]
  );
  const dot2Opacity = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.125, cycleDuration * 0.375, cycleDuration * 0.625, cycleDuration],
    [0.4, 0.4, 1, 0.4, 0.4]
  );
  const dot3Opacity = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.25, cycleDuration * 0.5, cycleDuration * 0.75, cycleDuration],
    [0.4, 0.4, 0.4, 1, 0.4]
  );

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      marginBottom: 8,
      opacity,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: "50%",
      backgroundColor: "#0088CC",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      flexShrink: 0,
    },
    bubble: {
      padding: "12px 16px",
      borderRadius: "18px 18px 18px 4px",
      backgroundColor,
      display: "flex",
      alignItems: "center",
      gap: 4,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      backgroundColor: dotColor,
    },
    statusText: {
      marginLeft: 8,
      fontSize: 12,
      color: "rgba(255, 255, 255, 0.5)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
  };

  return (
    <div style={styles.container}>
      {showAvatar && <div style={styles.avatar}>{avatarEmoji}</div>}
      <div style={styles.bubble}>
        <div
          style={{
            ...styles.dot,
            transform: `translateY(${dot1Y}px)`,
            opacity: dot1Opacity,
          }}
        />
        <div
          style={{
            ...styles.dot,
            transform: `translateY(${dot2Y}px)`,
            opacity: dot2Opacity,
          }}
        />
        <div
          style={{
            ...styles.dot,
            transform: `translateY(${dot3Y}px)`,
            opacity: dot3Opacity,
          }}
        />
      </div>
    </div>
  );
};
