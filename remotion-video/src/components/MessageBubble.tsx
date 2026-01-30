import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface MessageBubbleProps {
  message: string;
  isUser?: boolean;
  timestamp?: string;
  showAvatar?: boolean;
  avatarUrl?: string;
  avatarEmoji?: string;
  animateEntry?: boolean;
  entryDelay?: number;
  maxWidth?: number;
  userColor?: string;
  botColor?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isUser = false,
  timestamp = "",
  showAvatar = false,
  avatarUrl,
  avatarEmoji = "🤖",
  animateEntry = true,
  entryDelay = 0,
  maxWidth = 260,
  userColor = "#7C3AED",
  botColor = "#2B2B2B",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = animateEntry
    ? spring({
        frame: frame - entryDelay,
        fps,
        config: {
          damping: 15,
          stiffness: 120,
          mass: 0.5,
        },
      })
    : 1;

  const scale = interpolate(entryProgress, [0, 1], [0.8, 1]);
  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const translateX = interpolate(
    entryProgress,
    [0, 1],
    [isUser ? 30 : -30, 0]
  );

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      alignItems: "flex-end",
      gap: 8,
      marginBottom: 8,
      opacity,
      transform: `translateX(${translateX}px) scale(${scale})`,
      transformOrigin: isUser ? "right bottom" : "left bottom",
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: "50%",
      backgroundColor: isUser ? userColor : "#0088CC",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      flexShrink: 0,
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
      objectFit: "cover" as const,
    },
    bubble: {
      maxWidth,
      padding: "10px 14px",
      borderRadius: isUser
        ? "18px 18px 4px 18px"
        : "18px 18px 18px 4px",
      backgroundColor: isUser ? userColor : botColor,
      color: "#FFFFFF",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: 15,
      lineHeight: 1.4,
      wordWrap: "break-word" as const,
      position: "relative" as const,
    },
    messageText: {
      margin: 0,
      whiteSpace: "pre-wrap" as const,
    },
    timestamp: {
      fontSize: 11,
      color: "rgba(255, 255, 255, 0.6)",
      marginTop: 4,
      textAlign: isUser ? "right" : "left" as const,
    },
    checkmarks: {
      display: "inline-flex",
      marginLeft: 4,
      verticalAlign: "middle",
    },
  };

  return (
    <div style={styles.container}>
      {showAvatar && (
        <div style={styles.avatar}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" style={styles.avatarImage} />
          ) : (
            avatarEmoji
          )}
        </div>
      )}
      <div style={styles.bubble}>
        <p style={styles.messageText}>{message}</p>
        {timestamp && (
          <div style={styles.timestamp}>
            {timestamp}
            {isUser && (
              <span style={styles.checkmarks}>
                <svg
                  width="16"
                  height="11"
                  viewBox="0 0 16 11"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1 5.5L4.5 9L11 2.5"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5 5.5L8.5 9L15 2.5"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
