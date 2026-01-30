import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface IconProps {
  size?: number;
  color?: string;
  animateEntry?: boolean;
  entryDelay?: number;
  spinning?: boolean;
  pulse?: boolean;
}

// Base wrapper for animated icons
const AnimatedIconWrapper: React.FC<IconProps & { children: React.ReactNode }> = ({
  size = 24,
  animateEntry = false,
  entryDelay = 0,
  spinning = false,
  pulse = false,
  children,
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

  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const scale = interpolate(entryProgress, [0, 1], [0.5, 1]);

  const spinRotation = spinning ? frame * 6 : 0;
  const pulseScale = pulse ? 1 + Math.sin(frame / 10) * 0.1 : 1;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale * pulseScale}) rotate(${spinRotation}deg)`,
      }}
    >
      {children}
    </div>
  );
};

// Folder Icon
export const FolderIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M10 4H4C2.89 4 2.01 4.89 2.01 6L2 18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V8C22 6.89 21.11 6 20 6H12L10 4Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Microphone Icon
export const MicrophoneIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z"/>
        <path d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Git Branch Icon
export const GitBranchIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Code Icon
export const CodeIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M9.4 16.6L4.8 12L9.4 7.4L8 6L2 12L8 18L9.4 16.6ZM14.6 16.6L19.2 12L14.6 7.4L16 6L22 12L16 18L14.6 16.6Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Terminal Icon
export const TerminalIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Send/Paper Plane Icon
export const SendIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Bot/Robot Icon
export const BotIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 2C10.9 2 10 2.9 10 4V5H6C4.9 5 4 5.9 4 7V10C2.9 10 2 10.9 2 12C2 13.1 2.9 14 4 14V17C4 18.1 4.9 19 6 19H18C19.1 19 20 18.1 20 17V14C21.1 14 22 13.1 22 12C22 10.9 21.1 10 20 10V7C20 5.9 19.1 5 18 5H14V4C14 2.9 13.1 2 12 2ZM9 10C9.55 10 10 10.45 10 11C10 11.55 9.55 12 9 12C8.45 12 8 11.55 8 11C8 10.45 8.45 10 9 10ZM15 10C15.55 10 16 10.45 16 11C16 11.55 15.55 12 15 12C14.45 12 14 11.55 14 11C14 10.45 14.45 10 15 10ZM9 15H15C15 16.1 13.65 17 12 17C10.35 17 9 16.1 9 15Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Telegram Icon
export const TelegramIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#0088CC" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.38 15.84 14.22 15.51 15.99C15.37 16.74 15.09 16.99 14.83 17.02C14.25 17.07 13.81 16.64 13.25 16.27C12.37 15.69 11.87 15.33 11.02 14.77C10.03 14.12 10.67 13.76 11.24 13.18C11.39 13.03 13.95 10.7 14 10.49C14.0069 10.4582 14.006 10.4252 13.9973 10.3938C13.9886 10.3624 13.9724 10.3337 13.95 10.31C13.89 10.26 13.81 10.28 13.74 10.29C13.65 10.31 12.25 11.24 9.52 13.08C9.12 13.35 8.76 13.49 8.44 13.48C8.08 13.47 7.4 13.28 6.89 13.11C6.26 12.91 5.77 12.8 5.81 12.45C5.83 12.27 6.08 12.09 6.55 11.9C9.47 10.63 11.41 9.79 12.38 9.39C15.16 8.23 15.73 8.03 16.11 8.03C16.19 8.03 16.38 8.05 16.5 8.15C16.6 8.23 16.63 8.34 16.64 8.42C16.63 8.48 16.65 8.66 16.64 8.8Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Claude AI Icon (stylized)
export const ClaudeIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#7C3AED" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
        <circle cx="12" cy="12" r="6" fill={color}/>
        <circle cx="12" cy="12" r="3" fill="white"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Checkmark Icon
export const CheckIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#10B981" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// X/Close Icon
export const CloseIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#EF4444" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Star Icon
export const StarIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FBBF24" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Loading/Spinner Icon
export const LoadingIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props} spinning={true}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M12 2V6"/>
        <path d="M12 18V22" opacity="0.3"/>
        <path d="M4.93 4.93L7.76 7.76" opacity="0.9"/>
        <path d="M16.24 16.24L19.07 19.07" opacity="0.2"/>
        <path d="M2 12H6" opacity="0.7"/>
        <path d="M18 12H22" opacity="0.4"/>
        <path d="M4.93 19.07L7.76 16.24" opacity="0.5"/>
        <path d="M16.24 7.76L19.07 4.93" opacity="0.6"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Lock Icon
export const LockIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Cloud Icon
export const CloudIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FFFFFF" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Lightning/Bolt Icon
export const BoltIcon: React.FC<IconProps> = (props) => {
  const { size = 24, color = "#FBBF24" } = props;
  return (
    <AnimatedIconWrapper {...props}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M11 21H7.5L13 11H9.5L14 3H17L13 11H17L11 21Z"/>
      </svg>
    </AnimatedIconWrapper>
  );
};

// Export all icons as a collection
export const Icons = {
  Folder: FolderIcon,
  Microphone: MicrophoneIcon,
  GitBranch: GitBranchIcon,
  Code: CodeIcon,
  Terminal: TerminalIcon,
  Send: SendIcon,
  Bot: BotIcon,
  Telegram: TelegramIcon,
  Claude: ClaudeIcon,
  Check: CheckIcon,
  Close: CloseIcon,
  Star: StarIcon,
  Loading: LoadingIcon,
  Lock: LockIcon,
  Cloud: CloudIcon,
  Bolt: BoltIcon,
};
