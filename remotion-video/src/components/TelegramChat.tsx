import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp?: string;
  delay?: number;
}

interface TelegramChatProps {
  chatTitle?: string;
  chatSubtitle?: string;
  messages?: Message[];
  showTyping?: boolean;
  typingDelay?: number;
  backgroundColor?: string;
  headerColor?: string;
  animateEntry?: boolean;
  entryDelay?: number;
  showHeader?: boolean;
  showInputBar?: boolean;
}

export const TelegramChat: React.FC<TelegramChatProps> = ({
  chatTitle = "Claude Bot",
  chatSubtitle = "online",
  messages = [],
  showTyping = false,
  typingDelay = 0,
  backgroundColor = "#0F0F0F",
  headerColor = "#1F2937",
  animateEntry = false,
  entryDelay = 0,
  showHeader = true,
  showInputBar = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerEntryProgress = animateEntry
    ? spring({
        frame: frame - entryDelay,
        fps,
        config: {
          damping: 15,
          stiffness: 100,
          mass: 0.5,
        },
      })
    : 1;

  const headerOpacity = interpolate(headerEntryProgress, [0, 1], [0, 1]);
  const headerTranslateY = interpolate(headerEntryProgress, [0, 1], [-20, 0]);

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      width: "100%",
      height: "100%",
      backgroundColor,
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      position: "relative" as const,
    },
    header: {
      height: 64,
      backgroundColor: headerColor,
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: 12,
      marginTop: 48,
      opacity: headerOpacity,
      transform: `translateY(${headerTranslateY}px)`,
    },
    backButton: {
      width: 24,
      height: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: "50%",
      backgroundColor: "#0088CC",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 20,
    },
    headerInfo: {
      flex: 1,
    },
    headerTitle: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: 600,
      margin: 0,
    },
    headerSubtitle: {
      color: "#0088CC",
      fontSize: 13,
      margin: 0,
    },
    headerActions: {
      display: "flex",
      gap: 20,
    },
    messagesContainer: {
      flex: 1,
      padding: "16px",
      overflowY: "hidden" as const,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
    },
    inputBar: {
      height: 56,
      backgroundColor: headerColor,
      display: "flex",
      alignItems: "center",
      padding: "0 12px",
      gap: 8,
      marginBottom: 20,
    },
    attachButton: {
      width: 32,
      height: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    inputField: {
      flex: 1,
      height: 36,
      backgroundColor: "#3B3B3B",
      borderRadius: 18,
      display: "flex",
      alignItems: "center",
      paddingLeft: 16,
      paddingRight: 8,
    },
    inputPlaceholder: {
      color: "rgba(255, 255, 255, 0.5)",
      fontSize: 15,
      flex: 1,
    },
    emojiButton: {
      width: 24,
      height: 24,
      opacity: 0.5,
    },
    micButton: {
      width: 32,
      height: 32,
      backgroundColor: "#0088CC",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
  };

  return (
    <div style={styles.container}>
      {showHeader && (
        <div style={styles.header}>
          <div style={styles.backButton}>
            <svg width="12" height="20" viewBox="0 0 12 20" fill="#0088CC">
              <path d="M10 2L2 10L10 18" stroke="#0088CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <div style={styles.avatar}>🤖</div>
          <div style={styles.headerInfo}>
            <p style={styles.headerTitle}>{chatTitle}</p>
            <p style={styles.headerSubtitle}>{chatSubtitle}</p>
          </div>
          <div style={styles.headerActions}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#0088CC">
              <path d="M20.01 15.38C18.78 15.38 17.59 15.18 16.48 14.82C16.13 14.7 15.74 14.79 15.47 15.06L13.9 17.03C11.07 15.68 8.42 13.13 7.01 10.2L8.96 8.54C9.23 8.26 9.31 7.87 9.2 7.52C8.83 6.41 8.64 5.22 8.64 3.99C8.64 3.45 8.19 3 7.65 3H4.19C3.65 3 3 3.24 3 3.99C3 13.28 10.73 21 20.01 21C20.72 21 21 20.37 21 19.82V16.37C21 15.83 20.55 15.38 20.01 15.38Z"/>
            </svg>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#0088CC">
              <circle cx="12" cy="5" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="12" cy="19" r="2"/>
            </svg>
          </div>
        </div>
      )}

      <div style={styles.messagesContainer}>
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg.text}
            isUser={msg.isUser}
            timestamp={msg.timestamp}
            animateEntry={true}
            entryDelay={msg.delay || 0}
            showAvatar={!msg.isUser}
          />
        ))}
        {showTyping && (
          <TypingIndicator show={true} showDelay={typingDelay} />
        )}
      </div>

      {showInputBar && (
        <div style={styles.inputBar}>
          <div style={styles.attachButton}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21.44 11.05L12.25 20.24C10.51 21.98 7.68 21.98 5.94 20.24C4.2 18.5 4.2 15.67 5.94 13.93L15.13 4.74C16.22 3.65 17.97 3.65 19.06 4.74C20.15 5.83 20.15 7.58 19.06 8.67L9.87 17.86C9.33 18.4 8.46 18.4 7.92 17.86C7.38 17.32 7.38 16.45 7.92 15.91L16.13 7.7" stroke="#0088CC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={styles.inputField}>
            <span style={styles.inputPlaceholder}>Message</span>
            <div style={styles.emojiButton}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none"/>
                <circle cx="8.5" cy="10" r="1.5" fill="rgba(255,255,255,0.5)"/>
                <circle cx="15.5" cy="10" r="1.5" fill="rgba(255,255,255,0.5)"/>
                <path d="M8 14C8.5 15.5 10 17 12 17C14 17 15.5 15.5 16 14" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
          </div>
          <div style={styles.micButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
              <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z"/>
              <path d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};
