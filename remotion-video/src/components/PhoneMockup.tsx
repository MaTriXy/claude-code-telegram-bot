import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface PhoneMockupProps {
  children?: React.ReactNode;
  scale?: number;
  showNotch?: boolean;
  frameColor?: string;
  screenColor?: string;
  animateEntry?: boolean;
  entryDelay?: number;
}

export const PhoneMockup: React.FC<PhoneMockupProps> = ({
  children,
  scale = 1,
  showNotch = true,
  frameColor = "#1F2937",
  screenColor = "#0F0F0F",
  animateEntry = false,
  entryDelay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = animateEntry
    ? spring({
        frame: frame - entryDelay,
        fps,
        config: {
          damping: 12,
          stiffness: 100,
          mass: 0.8,
        },
      })
    : 1;

  const translateY = interpolate(entryProgress, [0, 1], [100, 0]);
  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      transform: `scale(${scale}) translateY(${translateY}px)`,
      opacity,
    },
    phone: {
      width: 375,
      height: 812,
      backgroundColor: frameColor,
      borderRadius: 55,
      padding: 12,
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      position: "relative" as const,
    },
    screen: {
      width: "100%",
      height: "100%",
      backgroundColor: screenColor,
      borderRadius: 44,
      overflow: "hidden",
      position: "relative" as const,
    },
    notch: {
      position: "absolute" as const,
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: 150,
      height: 34,
      backgroundColor: frameColor,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      zIndex: 10,
    },
    dynamicIsland: {
      position: "absolute" as const,
      top: 12,
      left: "50%",
      transform: "translateX(-50%)",
      width: 120,
      height: 36,
      backgroundColor: "#000000",
      borderRadius: 20,
      zIndex: 10,
    },
    statusBar: {
      position: "absolute" as const,
      top: 12,
      left: 30,
      right: 30,
      height: 24,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 5,
    },
    statusTime: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: 600,
      fontFamily: "SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif",
    },
    statusIcons: {
      display: "flex",
      alignItems: "center",
      gap: 4,
    },
    content: {
      width: "100%",
      height: "100%",
      position: "relative" as const,
    },
    homeIndicator: {
      position: "absolute" as const,
      bottom: 8,
      left: "50%",
      transform: "translateX(-50%)",
      width: 134,
      height: 5,
      backgroundColor: "#FFFFFF",
      borderRadius: 3,
      opacity: 0.3,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.phone}>
        <div style={styles.screen}>
          {showNotch && <div style={styles.dynamicIsland} />}
          <div style={styles.statusBar}>
            <span style={styles.statusTime}>9:41</span>
            <div style={styles.statusIcons}>
              <svg width="18" height="12" viewBox="0 0 18 12" fill="white">
                <path d="M1 4.5C1 3.67 1.67 3 2.5 3H3.5C4.33 3 5 3.67 5 4.5V10.5C5 11.33 4.33 12 3.5 12H2.5C1.67 12 1 11.33 1 10.5V4.5Z" opacity="0.4"/>
                <path d="M6 3C6 2.17 6.67 1.5 7.5 1.5H8.5C9.33 1.5 10 2.17 10 3V10.5C10 11.33 9.33 12 8.5 12H7.5C6.67 12 6 11.33 6 10.5V3Z" opacity="0.6"/>
                <path d="M11 1.5C11 0.67 11.67 0 12.5 0H13.5C14.33 0 15 0.67 15 1.5V10.5C15 11.33 14.33 12 13.5 12H12.5C11.67 12 11 11.33 11 10.5V1.5Z"/>
              </svg>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="white">
                <path d="M8 2C11.31 2 14.18 3.56 16 6C14.18 8.44 11.31 10 8 10C4.69 10 1.82 8.44 0 6C1.82 3.56 4.69 2 8 2Z" opacity="0.3"/>
                <path d="M15 1L14 0L1 11L2 12" stroke="white" strokeWidth="1.5"/>
              </svg>
              <svg width="25" height="12" viewBox="0 0 25 12" fill="white">
                <rect x="0" y="0" width="22" height="12" rx="3" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/>
                <rect x="2" y="2" width="16" height="8" rx="1.5" fill="white"/>
                <path d="M23 4V8C24 7.5 24 4.5 23 4Z" fill="white" opacity="0.5"/>
              </svg>
            </div>
          </div>
          <div style={styles.content}>{children}</div>
          <div style={styles.homeIndicator} />
        </div>
      </div>
    </div>
  );
};
