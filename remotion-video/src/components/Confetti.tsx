import React, { useMemo } from "react";
import { useCurrentFrame, interpolate, random, useVideoConfig } from "remotion";

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  delay: number;
  velocityX: number;
  velocityY: number;
  shape: "square" | "circle" | "strip";
}

interface ConfettiProps {
  startFrame?: number;
  duration?: number;
  count?: number;
  colors?: string[];
  spread?: number;
  originX?: number;
  originY?: number;
  gravity?: number;
  fadeOut?: boolean;
}

export const Confetti: React.FC<ConfettiProps> = ({
  startFrame = 0,
  duration = 90,
  count = 50,
  colors = ["#7C3AED", "#3B82F6", "#10B981", "#FBBF24", "#EF4444", "#EC4899"],
  spread = 400,
  originX = 0.5,
  originY = 0.4,
  gravity = 0.5,
  fadeOut = true,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Generate confetti pieces only once
  const pieces = useMemo(() => {
    const result: ConfettiPiece[] = [];
    for (let i = 0; i < count; i++) {
      const angle = random(`angle-${i}`) * Math.PI * 2;
      const speed = random(`speed-${i}`) * spread + spread * 0.3;

      result.push({
        id: i,
        x: width * originX,
        y: height * originY,
        rotation: random(`rotation-${i}`) * 360,
        rotationSpeed: (random(`rotSpeed-${i}`) - 0.5) * 20,
        size: random(`size-${i}`) * 10 + 6,
        color: colors[Math.floor(random(`color-${i}`) * colors.length)],
        delay: random(`delay-${i}`) * 10,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed - speed * 0.5,
        shape: ["square", "circle", "strip"][Math.floor(random(`shape-${i}`) * 3)] as "square" | "circle" | "strip",
      });
    }
    return result;
  }, [count, colors, spread, width, height, originX, originY]);

  const relativeFrame = frame - startFrame;

  if (relativeFrame < 0) {
    return null;
  }

  const globalOpacity = fadeOut
    ? interpolate(relativeFrame, [duration - 30, duration], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  if (relativeFrame > duration + 30) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        opacity: globalOpacity,
      }}
    >
      {pieces.map((piece) => {
        const pieceFrame = relativeFrame - piece.delay;
        if (pieceFrame < 0) return null;

        const t = pieceFrame / 30; // Time in seconds
        const x = piece.x + piece.velocityX * t;
        const y = piece.y + piece.velocityY * t + 0.5 * gravity * 1000 * t * t;
        const rotation = piece.rotation + piece.rotationSpeed * pieceFrame;

        const opacity = interpolate(
          pieceFrame,
          [0, 5, duration - 20, duration],
          [0, 1, 1, 0],
          { extrapolateRight: "clamp" }
        );

        const scale = interpolate(
          pieceFrame,
          [0, 10],
          [0.5, 1],
          { extrapolateRight: "clamp" }
        );

        // Wobble effect
        const wobble = Math.sin(pieceFrame / 3) * 10;

        return (
          <div
            key={piece.id}
            style={{
              position: "absolute",
              left: x + wobble,
              top: y,
              width: piece.shape === "strip" ? piece.size * 0.4 : piece.size,
              height: piece.shape === "strip" ? piece.size * 2 : piece.size,
              backgroundColor: piece.color,
              borderRadius: piece.shape === "circle" ? "50%" : piece.shape === "strip" ? 2 : 2,
              transform: `rotate(${rotation}deg) scale(${scale})`,
              opacity,
              boxShadow: `0 2px 4px ${piece.color}40`,
            }}
          />
        );
      })}
    </div>
  );
};

// Burst animation from a specific point
interface ConfettiBurstProps {
  x: number;
  y: number;
  startFrame?: number;
  count?: number;
  colors?: string[];
  size?: number;
}

export const ConfettiBurst: React.FC<ConfettiBurstProps> = ({
  x,
  y,
  startFrame = 0,
  count = 30,
  colors = ["#7C3AED", "#3B82F6", "#10B981", "#FBBF24"],
  size = 8,
}) => {
  const frame = useCurrentFrame();

  const pieces = useMemo(() => {
    const result: { angle: number; speed: number; color: string; delay: number }[] = [];
    for (let i = 0; i < count; i++) {
      result.push({
        angle: (i / count) * Math.PI * 2 + random(`burst-angle-${i}`) * 0.5,
        speed: random(`burst-speed-${i}`) * 150 + 100,
        color: colors[Math.floor(random(`burst-color-${i}`) * colors.length)],
        delay: random(`burst-delay-${i}`) * 5,
      });
    }
    return result;
  }, [count, colors]);

  const relativeFrame = frame - startFrame;

  if (relativeFrame < 0 || relativeFrame > 60) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {pieces.map((piece, i) => {
        const pieceFrame = relativeFrame - piece.delay;
        if (pieceFrame < 0) return null;

        const t = pieceFrame / 30;
        const distance = piece.speed * t;
        const px = x + Math.cos(piece.angle) * distance;
        const py = y + Math.sin(piece.angle) * distance + 200 * t * t;

        const opacity = interpolate(pieceFrame, [0, 5, 40, 50], [0, 1, 1, 0], {
          extrapolateRight: "clamp",
        });

        const scale = interpolate(pieceFrame, [0, 10, 40, 50], [0.3, 1, 0.8, 0.3], {
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: size,
              height: size,
              backgroundColor: piece.color,
              borderRadius: "50%",
              transform: `scale(${scale})`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};

// Celebration effect with multiple bursts
interface CelebrationProps {
  startFrame?: number;
  burstCount?: number;
  colors?: string[];
}

export const Celebration: React.FC<CelebrationProps> = ({
  startFrame = 0,
  burstCount = 3,
  colors = ["#7C3AED", "#3B82F6", "#10B981", "#FBBF24", "#EC4899"],
}) => {
  const { width, height } = useVideoConfig();

  const bursts = useMemo(() => {
    const result: { x: number; y: number; delay: number }[] = [];
    for (let i = 0; i < burstCount; i++) {
      result.push({
        x: width * (0.2 + random(`celebration-x-${i}`) * 0.6),
        y: height * (0.3 + random(`celebration-y-${i}`) * 0.3),
        delay: i * 8,
      });
    }
    return result;
  }, [burstCount, width, height]);

  return (
    <>
      <Confetti
        startFrame={startFrame}
        duration={120}
        count={80}
        colors={colors}
      />
      {bursts.map((burst, i) => (
        <ConfettiBurst
          key={i}
          x={burst.x}
          y={burst.y}
          startFrame={startFrame + burst.delay}
          colors={colors}
        />
      ))}
    </>
  );
};
