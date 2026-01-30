import React from "react";
import { Composition, Series, AbsoluteFill } from "remotion";
import {
  HookScene,
  ProblemScene,
  SolutionScene,
  DemoScene,
  FeaturesScene,
  CTAScene,
} from "./scenes";

// Video configuration
const VIDEO_CONFIG = {
  width: 1920,
  height: 1080,
  fps: 30,
};

// Scene durations in frames
const SCENE_DURATIONS = {
  hook: 120,      // 4 seconds
  problem: 180,   // 6 seconds
  solution: 180,  // 6 seconds
  demo: 420,      // 14 seconds
  features: 360,  // 12 seconds
  cta: 180,       // 6 seconds
};

// Total duration: 1440 frames (48 seconds)
const TOTAL_DURATION =
  SCENE_DURATIONS.hook +
  SCENE_DURATIONS.problem +
  SCENE_DURATIONS.solution +
  SCENE_DURATIONS.demo +
  SCENE_DURATIONS.features +
  SCENE_DURATIONS.cta;

// Background color for consistency
const BACKGROUND_COLOR = "#0F0F0F";

/**
 * MainVideo - The complete video composition combining all 6 scenes
 * Uses Remotion's Series component to sequence scenes in order
 */
export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND_COLOR }}>
      <Series>
        {/* Scene 1: Hook - Attention grabber */}
        <Series.Sequence durationInFrames={SCENE_DURATIONS.hook}>
          <HookScene />
        </Series.Sequence>

        {/* Scene 2: Problem - Identify the pain point */}
        <Series.Sequence durationInFrames={SCENE_DURATIONS.problem}>
          <ProblemScene />
        </Series.Sequence>

        {/* Scene 3: Solution - Introduce the product */}
        <Series.Sequence durationInFrames={SCENE_DURATIONS.solution}>
          <SolutionScene />
        </Series.Sequence>

        {/* Scene 4: Demo - Show it in action */}
        <Series.Sequence durationInFrames={SCENE_DURATIONS.demo}>
          <DemoScene />
        </Series.Sequence>

        {/* Scene 5: Features - Highlight key benefits */}
        <Series.Sequence durationInFrames={SCENE_DURATIONS.features}>
          <FeaturesScene />
        </Series.Sequence>

        {/* Scene 6: CTA - Call to action */}
        <Series.Sequence durationInFrames={SCENE_DURATIONS.cta}>
          <CTAScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main video composition - all scenes combined */}
      <Composition
        id="MainVideo"
        component={MainVideo}
        durationInFrames={TOTAL_DURATION}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />

      {/* Individual scene compositions for preview/testing */}
      <Composition
        id="HookScene"
        component={HookScene}
        durationInFrames={SCENE_DURATIONS.hook}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />

      <Composition
        id="ProblemScene"
        component={ProblemScene}
        durationInFrames={SCENE_DURATIONS.problem}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />

      <Composition
        id="SolutionScene"
        component={SolutionScene}
        durationInFrames={SCENE_DURATIONS.solution}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />

      <Composition
        id="DemoScene"
        component={DemoScene}
        durationInFrames={SCENE_DURATIONS.demo}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />

      <Composition
        id="FeaturesScene"
        component={FeaturesScene}
        durationInFrames={SCENE_DURATIONS.features}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />

      <Composition
        id="CTAScene"
        component={CTAScene}
        durationInFrames={SCENE_DURATIONS.cta}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
      />
    </>
  );
};
