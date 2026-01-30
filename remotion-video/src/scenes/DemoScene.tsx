import React, { useMemo } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
} from "remotion";
import { PhoneMockup } from "../components/PhoneMockup";
import { Confetti } from "../components/Confetti";

// Color palette
const COLORS = {
  primary: "#7C3AED", // User messages (purple)
  telegramBlue: "#0088CC",
  accent: "#10B981", // Success green
  background: "#0F0F0F",
  botMessage: "#2A2A2A",
  text: "#FFFFFF",
  buttonAccept: "#10B981",
  buttonReject: "#EF4444",
  buttonModify: "#F59E0B",
};

// Message data structure
interface Message {
  id: number;
  text: string;
  isUser: boolean;
  showAt: number; // Frame when message appears
  hasProgress?: boolean;
  progressStartFrame?: number;
  progressDuration?: number;
  hasButtons?: boolean;
  buttonsShowAt?: number;
  isSuccess?: boolean;
  endpoints?: string[];
}

// Conversation messages with timing
const MESSAGES: Message[] = [
  {
    id: 1,
    text: "/start my-project",
    isUser: true,
    showAt: 30,
  },
  {
    id: 2,
    text: "Session started for 'my-project'",
    isUser: false,
    showAt: 75,
  },
  {
    id: 3,
    text: "Create a REST API with Express",
    isUser: true,
    showAt: 90,
  },
  {
    id: 4,
    text: "Working on it...",
    isUser: false,
    showAt: 145,
    hasProgress: true,
    progressStartFrame: 150,
    progressDuration: 50,
  },
  {
    id: 5,
    text: "Ready for review!",
    isUser: false,
    showAt: 210,
    hasButtons: true,
    buttonsShowAt: 220,
  },
  {
    id: 6,
    text: "Done! API created with 5 endpoints.",
    isUser: false,
    showAt: 310,
    isSuccess: true,
    endpoints: [
      "GET /api/users",
      "POST /api/users",
      "GET /api/users/:id",
      "PUT /api/users/:id",
      "DELETE /api/users/:id",
    ],
  },
];

// Typing Indicator Component
const TypingIndicator: React.FC<{
  showAt: number;
  hideAt: number;
}> = ({ showAt, hideAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < showAt || frame >= hideAt) return null;

  const delayedFrame = frame - showAt;
  const opacity = interpolate(delayedFrame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Dot animation
  const cycleDuration = fps * 0.6;
  const cycleFrame = delayedFrame % cycleDuration;

  const dot1Y = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.25, cycleDuration * 0.5, cycleDuration],
    [0, -5, 0, 0]
  );
  const dot2Y = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.125, cycleDuration * 0.375, cycleDuration * 0.625, cycleDuration],
    [0, 0, -5, 0, 0]
  );
  const dot3Y = interpolate(
    cycleFrame,
    [0, cycleDuration * 0.25, cycleDuration * 0.5, cycleDuration * 0.75, cycleDuration],
    [0, 0, 0, -5, 0]
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 6,
        marginBottom: 6,
        opacity,
        paddingLeft: 8,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          backgroundColor: COLORS.telegramBlue,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        🤖
      </div>
      <div
        style={{
          padding: "8px 14px",
          borderRadius: "14px 14px 14px 4px",
          backgroundColor: COLORS.botMessage,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {[dot1Y, dot2Y, dot3Y].map((y, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: COLORS.text,
              transform: `translateY(${y}px)`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    </div>
  );
};

// Message Bubble Component
const MessageBubble: React.FC<{
  message: Message;
  buttonHighlighted?: boolean;
}> = ({ message, buttonHighlighted }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < message.showAt) return null;

  const delayedFrame = frame - message.showAt;

  // Entry animation
  const entryProgress = spring({
    frame: delayedFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 120,
      mass: 0.5,
    },
  });

  const scale = interpolate(entryProgress, [0, 1], [0.8, 1]);
  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const translateX = interpolate(
    entryProgress,
    [0, 1],
    [message.isUser ? 30 : -30, 0]
  );

  // Progress bar animation
  const progressValue = message.hasProgress && message.progressStartFrame
    ? interpolate(
        frame,
        [message.progressStartFrame, message.progressStartFrame + (message.progressDuration || 50)],
        [0, 100],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    : 0;

  // Buttons animation
  const buttonsVisible = message.hasButtons && message.buttonsShowAt && frame >= message.buttonsShowAt;
  const buttonsProgress = buttonsVisible
    ? spring({
        frame: frame - (message.buttonsShowAt || 0),
        fps,
        config: {
          damping: 12,
          stiffness: 180,
          mass: 0.5,
        },
      })
    : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: message.isUser ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: 6,
        marginBottom: 6,
        opacity,
        transform: `translateX(${translateX}px) scale(${scale})`,
        transformOrigin: message.isUser ? "right bottom" : "left bottom",
        paddingLeft: message.isUser ? 0 : 8,
        paddingRight: message.isUser ? 8 : 0,
      }}
    >
      {/* Avatar */}
      {!message.isUser && (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: COLORS.telegramBlue,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          🤖
        </div>
      )}

      {/* Bubble */}
      <div
        style={{
          maxWidth: 200,
          padding: "8px 12px",
          borderRadius: message.isUser
            ? "14px 14px 4px 14px"
            : "14px 14px 14px 4px",
          backgroundColor: message.isUser
            ? COLORS.primary
            : message.isSuccess
            ? `${COLORS.accent}15`
            : COLORS.botMessage,
          border: message.isSuccess ? `1px solid ${COLORS.accent}40` : "none",
          color: COLORS.text,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        {/* Success checkmark */}
        {message.isSuccess && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <AnimatedCheckmark showAt={message.showAt} />
            <span style={{ color: COLORS.accent, fontWeight: 600, fontSize: 12 }}>
              Success
            </span>
          </div>
        )}

        {/* Message text */}
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.text}</p>

        {/* Endpoints list */}
        {message.endpoints && (
          <div style={{ marginTop: 8 }}>
            {message.endpoints.map((endpoint, i) => {
              const endpointDelay = message.showAt + 15 + i * 6;
              const endpointVisible = frame >= endpointDelay;
              const endpointOpacity = endpointVisible
                ? interpolate(
                    frame - endpointDelay,
                    [0, 8],
                    [0, 1],
                    { extrapolateRight: "clamp" }
                  )
                : 0;

              return (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    color: "rgba(255, 255, 255, 0.7)",
                    padding: "2px 6px",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    borderRadius: 4,
                    marginTop: 3,
                    opacity: endpointOpacity,
                    transform: `translateX(${(1 - endpointOpacity) * -10}px)`,
                  }}
                >
                  {endpoint}
                </div>
              );
            })}
          </div>
        )}

        {/* Progress bar */}
        {message.hasProgress && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                height: 4,
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressValue}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${COLORS.telegramBlue}, ${COLORS.primary})`,
                  borderRadius: 2,
                  transition: "width 0.1s ease-out",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255, 255, 255, 0.5)",
                marginTop: 3,
                textAlign: "right",
              }}
            >
              {Math.round(progressValue)}%
            </div>
          </div>
        )}

        {/* Action buttons */}
        {message.hasButtons && buttonsVisible && (
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 10,
              transform: `scale(${interpolate(buttonsProgress, [0, 1], [0.8, 1])})`,
              opacity: buttonsProgress,
            }}
          >
            <ActionButtonSmall
              label="Accept"
              color={COLORS.buttonAccept}
              highlighted={buttonHighlighted}
              bounceDelay={0}
            />
            <ActionButtonSmall
              label="Reject"
              color={COLORS.buttonReject}
              highlighted={false}
              bounceDelay={3}
            />
            <ActionButtonSmall
              label="Modify"
              color={COLORS.buttonModify}
              highlighted={false}
              bounceDelay={6}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Action Button Component
const ActionButtonSmall: React.FC<{
  label: string;
  color: string;
  highlighted: boolean | undefined;
  bounceDelay: number;
}> = ({ label, color, highlighted, bounceDelay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bounce animation
  const bounceProgress = spring({
    frame: frame - bounceDelay,
    fps,
    config: {
      damping: 8,
      stiffness: 200,
      mass: 0.3,
    },
  });

  const bounceScale = interpolate(bounceProgress, [0, 0.5, 1], [0.5, 1.15, 1]);

  // Highlight pulse
  const highlightPulse = highlighted
    ? 1 + Math.sin(frame / 4) * 0.08
    : 1;

  return (
    <div
      style={{
        padding: "5px 10px",
        backgroundColor: highlighted ? color : `${color}30`,
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 600,
        color: highlighted ? "#FFFFFF" : color,
        transform: `scale(${bounceScale * highlightPulse})`,
        boxShadow: highlighted ? `0 2px 8px ${color}60` : "none",
        border: `1px solid ${color}50`,
      }}
    >
      {label}
    </div>
  );
};

// Animated Checkmark Component
const AnimatedCheckmark: React.FC<{ showAt: number }> = ({ showAt }) => {
  const frame = useCurrentFrame();

  if (frame < showAt) return null;

  const progress = interpolate(
    frame - showAt,
    [0, 15],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  // Draw checkmark path
  const pathLength = 24;
  const dashOffset = pathLength * (1 - progress);

  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle
        cx="8"
        cy="8"
        r="7"
        fill={COLORS.accent}
        opacity={progress}
      />
      <path
        d="M4.5 8 L7 10.5 L11.5 5.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={pathLength}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
};

// Telegram Header Component
const TelegramHeader: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: 50,
        left: 0,
        right: 0,
        height: 50,
        backgroundColor: COLORS.telegramBlue,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 10,
      }}
    >
      {/* Back arrow */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>

      {/* Bot avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 255, 255, 0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        🤖
      </div>

      {/* Bot name */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            color: COLORS.text,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Claude Code Bot
        </div>
        <div
          style={{
            color: "rgba(255, 255, 255, 0.7)",
            fontSize: 11,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          online
        </div>
      </div>

      {/* Menu icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </div>
  );
};

// Input Bar Component
const InputBar: React.FC<{ typingText: string; showAt: number }> = ({
  typingText,
  showAt,
}) => {
  const frame = useCurrentFrame();

  const displayText = frame >= showAt
    ? typingText.slice(0, Math.floor((frame - showAt) / 2))
    : "";

  const cursorVisible = frame >= showAt && Math.sin(frame / 4) > 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 8,
        right: 8,
        height: 40,
        backgroundColor: COLORS.botMessage,
        borderRadius: 20,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
      }}
    >
      <div
        style={{
          flex: 1,
          color: displayText ? COLORS.text : "rgba(255, 255, 255, 0.4)",
          fontSize: 13,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {displayText || "Message"}
        {cursorVisible && displayText && (
          <span style={{ color: COLORS.primary }}>|</span>
        )}
      </div>

      {/* Send button */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          backgroundColor: displayText ? COLORS.telegramBlue : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={displayText ? "white" : "rgba(255, 255, 255, 0.3)"}
        >
          <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" />
        </svg>
      </div>
    </div>
  );
};

// Mini Confetti for inside the phone
const MiniConfetti: React.FC<{
  startFrame: number;
  originX: number;
  originY: number;
}> = ({ startFrame, originX, originY }) => {
  const frame = useCurrentFrame();

  const pieces = useMemo(() => {
    const colors = [COLORS.accent, COLORS.primary, COLORS.telegramBlue, "#FBBF24", "#EC4899"];
    return Array.from({ length: 25 }, (_, i) => ({
      id: i,
      angle: (i / 25) * Math.PI * 2 + Math.random() * 0.5,
      speed: 40 + Math.random() * 60,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 4,
      delay: Math.random() * 5,
    }));
  }, []);

  const relativeFrame = frame - startFrame;

  if (relativeFrame < 0 || relativeFrame > 60) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {pieces.map((piece) => {
        const pieceFrame = relativeFrame - piece.delay;
        if (pieceFrame < 0) return null;

        const t = pieceFrame / 20;
        const x = originX + Math.cos(piece.angle) * piece.speed * t;
        const y = originY + Math.sin(piece.angle) * piece.speed * t + 100 * t * t;

        const opacity = interpolate(
          pieceFrame,
          [0, 5, 35, 45],
          [0, 1, 1, 0],
          { extrapolateRight: "clamp" }
        );

        return (
          <div
            key={piece.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: piece.size,
              height: piece.size,
              backgroundColor: piece.color,
              borderRadius: "50%",
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};

// Main Demo Scene Component
export const DemoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // ===== TIMELINE =====
  // Frames 0-30: Phone scales up
  // Frames 30-60: User sends "/start my-project"
  // Frames 60-90: Bot typing, then "Session started"
  // Frames 90-130: User sends "Create a REST API"
  // Frames 130-200: Bot typing, then "Working on it..." with progress bar
  // Frames 200-260: Progress completes, "Ready for review!" with buttons
  // Frames 260-300: User taps Accept (highlight button)
  // Frames 300-380: "Done!" message with checkmark and endpoints list
  // Frames 380-420: Confetti celebration, exit transition

  // Animation 1: Phone scale-up (frames 0-30)
  const phoneScaleProgress = spring({
    frame,
    fps,
    config: {
      damping: 12,
      stiffness: 80,
      mass: 1,
    },
  });

  const phoneScale = interpolate(phoneScaleProgress, [0, 1], [0.6, 0.85]);
  const phoneOpacity = interpolate(phoneScaleProgress, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });
  const phoneY = interpolate(phoneScaleProgress, [0, 1], [50, 0]);

  // Typing indicators timing
  const showTyping1 = frame >= 60 && frame < 75; // Before "Session started"
  const showTyping2 = frame >= 130 && frame < 145; // Before "Working on it..."
  const showTyping3 = frame >= 195 && frame < 210; // Before "Ready for review!"
  const showTyping4 = frame >= 295 && frame < 310; // Before "Done!"

  // Button highlight (frames 260-300)
  const buttonHighlighted = frame >= 265 && frame < 300;

  // Confetti timing (frames 315-380)
  const showConfetti = frame >= 320;

  // Exit transition (frames 380-420)
  const exitStart = durationInFrames - 40;
  const exitProgress = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Title animation
  const titleOpacity = interpolate(
    frame,
    [0, 20, exitStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp" }
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

      {/* Scene title */}
      <div
        style={{
          position: "absolute",
          top: "6%",
          width: "100%",
          textAlign: "center",
          opacity: titleOpacity,
        }}
      >
        <h2
          style={{
            fontSize: 36,
            fontWeight: 600,
            color: COLORS.text,
            margin: 0,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          See it in action
        </h2>
        <p
          style={{
            fontSize: 18,
            color: "rgba(255, 255, 255, 0.6)",
            margin: "8px 0 0 0",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Creating a REST API in seconds
        </p>
      </div>

      {/* Phone mockup */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) translateY(${phoneY}px) scale(${phoneScale})`,
          opacity: phoneOpacity,
        }}
      >
        <PhoneMockup
          scale={1}
          showNotch={true}
          frameColor="#1F2937"
          screenColor={COLORS.background}
        >
          {/* Telegram Header */}
          <TelegramHeader />

          {/* Chat area */}
          <div
            style={{
              position: "absolute",
              top: 100,
              left: 0,
              right: 0,
              bottom: 70,
              overflowY: "hidden",
              padding: "10px 0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Typing indicators */}
            {showTyping1 && <TypingIndicator showAt={60} hideAt={75} />}

            {/* Messages */}
            {MESSAGES.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                buttonHighlighted={msg.hasButtons ? buttonHighlighted : undefined}
              />
            ))}

            {/* Typing indicators that appear after some messages */}
            {showTyping2 && <TypingIndicator showAt={130} hideAt={145} />}
            {showTyping3 && <TypingIndicator showAt={195} hideAt={210} />}
            {showTyping4 && <TypingIndicator showAt={295} hideAt={310} />}
          </div>

          {/* Input bar */}
          <InputBar typingText="" showAt={999} />

          {/* Mini confetti inside phone */}
          {showConfetti && (
            <MiniConfetti
              startFrame={320}
              originX={175}
              originY={350}
            />
          )}
        </PhoneMockup>
      </div>

      {/* Full-screen confetti */}
      {showConfetti && (
        <Confetti
          startFrame={320}
          duration={100}
          count={60}
          colors={[COLORS.accent, COLORS.primary, COLORS.telegramBlue, "#FBBF24", "#EC4899"]}
          spread={500}
          originX={0.5}
          originY={0.4}
          gravity={0.3}
          fadeOut={true}
        />
      )}

      {/* Decorative elements */}
      <div
        style={{
          position: "absolute",
          bottom: "8%",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 8,
          opacity: interpolate(frame, [280, 320, exitStart, durationInFrames], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {["Fast", "Secure", "Powerful"].map((text, i) => {
          const tagDelay = 290 + i * 10;
          const tagOpacity = frame >= tagDelay
            ? interpolate(frame - tagDelay, [0, 15], [0, 1], { extrapolateRight: "clamp" })
            : 0;

          return (
            <div
              key={text}
              style={{
                padding: "8px 16px",
                backgroundColor: `${COLORS.primary}20`,
                borderRadius: 20,
                fontSize: 14,
                fontWeight: 500,
                color: COLORS.text,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                border: `1px solid ${COLORS.primary}40`,
                opacity: tagOpacity,
                transform: `translateY(${(1 - tagOpacity) * 10}px)`,
              }}
            >
              {text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
