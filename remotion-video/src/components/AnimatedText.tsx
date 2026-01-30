import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface AnimatedTextProps {
  text: string;
  animation?: "fadeIn" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "typewriter" | "wordByWord" | "characterByCharacter";
  delay?: number;
  duration?: number;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  maxWidth?: number | string;
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  animation = "fadeIn",
  delay = 0,
  duration = 30,
  fontSize = 32,
  fontWeight = 400,
  color = "#FFFFFF",
  textAlign = "left",
  lineHeight = 1.4,
  maxWidth,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  // Spring animation for smooth entry
  const springProgress = spring({
    frame: delayedFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
      mass: 0.5,
    },
  });

  // Linear interpolation for typewriter effect
  const linearProgress = interpolate(
    delayedFrame,
    [0, duration],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const baseStyles: React.CSSProperties = {
    fontSize,
    fontWeight,
    color,
    textAlign,
    lineHeight,
    maxWidth,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    margin: 0,
    ...style,
  };

  // Animation-specific rendering
  if (animation === "typewriter") {
    const visibleChars = Math.floor(linearProgress * text.length);
    const visibleText = text.slice(0, visibleChars);
    const cursorOpacity = Math.sin(frame / 5) > 0 ? 1 : 0;

    return (
      <p style={baseStyles}>
        {visibleText}
        <span style={{ opacity: cursorOpacity }}>|</span>
      </p>
    );
  }

  if (animation === "wordByWord") {
    const words = text.split(" ");

    return (
      <p style={baseStyles}>
        {words.map((word, index) => {
          const wordDelay = index * 5;
          const wordProgress = spring({
            frame: delayedFrame - wordDelay,
            fps,
            config: {
              damping: 15,
              stiffness: 120,
              mass: 0.4,
            },
          });
          const opacity = interpolate(wordProgress, [0, 1], [0, 1]);
          const translateY = interpolate(wordProgress, [0, 1], [10, 0]);

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                opacity,
                transform: `translateY(${translateY}px)`,
                marginRight: "0.25em",
              }}
            >
              {word}
            </span>
          );
        })}
      </p>
    );
  }

  if (animation === "characterByCharacter") {
    const characters = text.split("");

    return (
      <p style={baseStyles}>
        {characters.map((char, index) => {
          const charDelay = index * 1.5;
          const charProgress = spring({
            frame: delayedFrame - charDelay,
            fps,
            config: {
              damping: 20,
              stiffness: 200,
              mass: 0.3,
            },
          });
          const opacity = interpolate(charProgress, [0, 1], [0, 1]);
          const scale = interpolate(charProgress, [0, 1], [0.5, 1]);

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                opacity,
                transform: `scale(${scale})`,
                whiteSpace: char === " " ? "pre" : "normal",
              }}
            >
              {char}
            </span>
          );
        })}
      </p>
    );
  }

  // Standard animations
  const animationMap = {
    fadeIn: { x: 0, y: 0 },
    slideUp: { x: 0, y: 30 },
    slideDown: { x: 0, y: -30 },
    slideLeft: { x: 30, y: 0 },
    slideRight: { x: -30, y: 0 },
  };

  const { x, y } = animationMap[animation] || animationMap.fadeIn;
  const translateX = interpolate(springProgress, [0, 1], [x, 0]);
  const translateY = interpolate(springProgress, [0, 1], [y, 0]);
  const opacity = interpolate(springProgress, [0, 1], [0, 1]);

  return (
    <p
      style={{
        ...baseStyles,
        opacity,
        transform: `translate(${translateX}px, ${translateY}px)`,
      }}
    >
      {text}
    </p>
  );
};

// Heading variants
interface HeadingProps extends Omit<AnimatedTextProps, "fontSize" | "fontWeight"> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const AnimatedHeading: React.FC<HeadingProps> = ({
  level = 1,
  ...props
}) => {
  const sizeMap = {
    1: { fontSize: 64, fontWeight: 700 },
    2: { fontSize: 48, fontWeight: 700 },
    3: { fontSize: 36, fontWeight: 600 },
    4: { fontSize: 28, fontWeight: 600 },
    5: { fontSize: 22, fontWeight: 600 },
    6: { fontSize: 18, fontWeight: 600 },
  };

  return <AnimatedText {...props} {...sizeMap[level]} />;
};

// Paragraph variant
export const AnimatedParagraph: React.FC<Omit<AnimatedTextProps, "fontSize" | "fontWeight">> = (props) => {
  return (
    <AnimatedText
      {...props}
      fontSize={18}
      fontWeight={400}
      color={props.color || "rgba(255, 255, 255, 0.7)"}
      lineHeight={1.6}
    />
  );
};

// Gradient text
interface GradientTextProps extends AnimatedTextProps {
  gradientColors?: [string, string];
  gradientDirection?: string;
}

export const GradientText: React.FC<GradientTextProps> = ({
  gradientColors = ["#7C3AED", "#3B82F6"],
  gradientDirection = "90deg",
  style = {},
  ...props
}) => {
  return (
    <AnimatedText
      {...props}
      style={{
        ...style,
        background: `linear-gradient(${gradientDirection}, ${gradientColors[0]}, ${gradientColors[1]})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    />
  );
};

// Counter/Number animation
interface AnimatedNumberProps {
  from?: number;
  to: number;
  delay?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  from = 0,
  to,
  delay = 0,
  duration = 60,
  prefix = "",
  suffix = "",
  decimals = 0,
  fontSize = 48,
  fontWeight = 700,
  color = "#FFFFFF",
}) => {
  const frame = useCurrentFrame();

  const delayedFrame = Math.max(0, frame - delay);
  const progress = interpolate(
    delayedFrame,
    [0, duration],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  // Easing for smooth number animation
  const easedProgress = 1 - Math.pow(1 - progress, 3);
  const currentValue = from + (to - from) * easedProgress;

  const styles: React.CSSProperties = {
    fontSize,
    fontWeight,
    color,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    margin: 0,
  };

  return (
    <span style={styles}>
      {prefix}
      {currentValue.toFixed(decimals)}
      {suffix}
    </span>
  );
};
