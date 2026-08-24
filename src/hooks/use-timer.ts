"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { StudyMethod } from "@/types";
import { STUDY_METHODS } from "@/types";

export type TimerMode = "focus" | "break" | "idle";
export type PhaseEndEvent = "break" | "focus" | "done";

export interface UseTimerOptions {
  studyMethod: StudyMethod;
  studyDuration?: number | null;
  breakDuration?: number | null;
  cycles?: number | null;
  targetDuration?: number | null;
  autoCycle?: boolean;
  onPhaseEnd?: (event: PhaseEndEvent) => void;
}

export interface UseTimerReturn {
  seconds: number;
  isRunning: boolean;
  mode: TimerMode;
  currentCycle: number;
  totalCycles: number;
  progress: number;
  phaseComplete: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  resumeFrom: (initialSeconds: number, initialMode: TimerMode, initialCycle?: number) => void;
  continueNext: () => void;
  reset: () => void;
  skip: () => void;
}

export function useTimer({
  studyMethod,
  studyDuration: customStudy,
  breakDuration: customBreak,
  cycles: customCycles,
  targetDuration,
  autoCycle = false,
  onPhaseEnd,
}: UseTimerOptions): UseTimerReturn {
  const config = STUDY_METHODS[studyMethod];
  const totalCycles = customCycles ?? config.cycles ?? 1;
  const focusDuration =
    studyMethod === "custom"
      ? (customStudy ?? 25 * 60)
      : config.studyDuration ?? 25 * 60;
  const breakDur =
    studyMethod === "custom"
      ? (customBreak ?? 5 * 60)
      : config.breakDuration ?? 5 * 60;
  const target = targetDuration ?? 0;

  const isCountdown =
    studyMethod === "pomodoro" ||
    studyMethod === "long_pomodoro" ||
    studyMethod === "deep_focus" ||
    studyMethod === "custom";

  const [seconds, setSeconds] = useState(() =>
    isCountdown ? focusDuration : 0,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<TimerMode>("idle");
  const [currentCycle, setCurrentCycle] = useState(1);
  const [phaseComplete, setPhaseComplete] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stateRef = useRef({
    isCountdown,
    focusDuration,
    breakDur,
    totalCycles,
    studyMethod,
    target,
    autoCycle,
    onPhaseEnd,
  });
  stateRef.current = {
    isCountdown,
    focusDuration,
    breakDur,
    totalCycles,
    studyMethod,
    target,
    autoCycle,
    onPhaseEnd,
  };

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const progress = (() => {
    if (studyMethod === "target" && target > 0) {
      return Math.min((seconds / target) * 100, 100);
    }
    if (isCountdown) {
      const total = mode === "break" ? breakDur : focusDuration;
      return total > 0 ? ((total - seconds) / total) * 100 : 0;
    }
    return 0;
  })();

  const startCountdown = useCallback(
    (initialSeconds: number, initialMode: TimerMode, initialCycle: number) => {
      clearTimer();
      setSeconds(initialSeconds);
      setMode(initialMode);
      setCurrentCycle(initialCycle);
      setIsRunning(true);
      setPhaseComplete(false);

      let remaining = initialSeconds;
      let currentMode: TimerMode = initialMode;
      let cycle = initialCycle;

      intervalRef.current = setInterval(() => {
        remaining -= 1;

        if (remaining <= 0) {
          if (currentMode === "focus") {
            if (cycle < stateRef.current.totalCycles) {
              stateRef.current.onPhaseEnd?.("break");
              if (stateRef.current.autoCycle) {
                currentMode = "break";
                remaining = stateRef.current.breakDur;
                setMode("break");
                setSeconds(remaining);
              } else {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
                setIsRunning(false);
                setSeconds(0);
                setPhaseComplete(true);
              }
            } else {
              stateRef.current.onPhaseEnd?.("done");
              clearInterval(intervalRef.current!);
              intervalRef.current = null;
              setIsRunning(false);
              setMode("idle");
              setSeconds(stateRef.current.focusDuration);
              setPhaseComplete(false);
            }
          } else {
            stateRef.current.onPhaseEnd?.("focus");
            if (stateRef.current.autoCycle) {
              cycle += 1;
              setCurrentCycle(cycle);
              currentMode = "focus";
              remaining = stateRef.current.focusDuration;
              setMode("focus");
              setSeconds(remaining);
            } else {
              clearInterval(intervalRef.current!);
              intervalRef.current = null;
              setIsRunning(false);
              setSeconds(0);
              setPhaseComplete(true);
            }
          }
        } else {
          setSeconds(remaining);
        }
      }, 1000);
    },
    [clearTimer],
  );

  const startCountup = useCallback(
    (initialSeconds: number) => {
      clearTimer();
      setSeconds(initialSeconds);
      setMode("focus");
      setCurrentCycle(1);
      setIsRunning(true);
      setPhaseComplete(false);

      let elapsed = initialSeconds;
      intervalRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (stateRef.current.target > 0 && elapsed >= stateRef.current.target) {
          stateRef.current.onPhaseEnd?.("done");
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsRunning(false);
          setMode("idle");
        }
      }, 1000);
    },
    [clearTimer],
  );

  const start = useCallback(() => {
    if (isCountdown) {
      startCountdown(focusDuration, "focus", 1);
    } else if (studyMethod === "target") {
      startCountup(0);
    } else {
      clearTimer();
      setSeconds(0);
      setMode("focus");
      setCurrentCycle(1);
      setIsRunning(true);
      setPhaseComplete(false);
      let elapsed = 0;
      intervalRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
      }, 1000);
    }
  }, [isCountdown, studyMethod, focusDuration, startCountdown, startCountup, clearTimer]);

  const pause = useCallback(() => {
    clearTimer();
    setIsRunning(false);
  }, [clearTimer]);

  const continueNext = useCallback(() => {
    if (!phaseComplete || mode === "idle") return;
    if (mode === "focus") {
      startCountdown(stateRef.current.breakDur, "break", currentCycle);
    } else {
      startCountdown(stateRef.current.focusDuration, "focus", currentCycle + 1);
    }
  }, [phaseComplete, mode, currentCycle, startCountdown]);

  const resume = useCallback(() => {
    if (phaseComplete) {
      continueNext();
      return;
    }
    if (mode === "idle") {
      start();
      return;
    }

    if (isCountdown) {
      startCountdown(seconds, mode, currentCycle);
    } else if (studyMethod === "target") {
      let elapsed = seconds;
      clearTimer();
      setIsRunning(true);
      intervalRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (stateRef.current.target > 0 && elapsed >= stateRef.current.target) {
          stateRef.current.onPhaseEnd?.("done");
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsRunning(false);
          setMode("idle");
        }
      }, 1000);
    } else {
      let elapsed = seconds;
      clearTimer();
      setIsRunning(true);
      intervalRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
      }, 1000);
    }
  }, [clearTimer, seconds, mode, currentCycle, isCountdown, studyMethod, start, startCountdown, phaseComplete, continueNext]);

  const resumeFrom = useCallback(
    (initialSeconds: number, initialMode: TimerMode, initialCycle: number = 1) => {
      if (isCountdown) {
        startCountdown(initialSeconds, initialMode, initialCycle);
      } else {
        startCountup(initialSeconds);
      }
    },
    [isCountdown, startCountdown, startCountup],
  );

  const reset = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setMode("idle");
    setCurrentCycle(1);
    setPhaseComplete(false);
    setSeconds(isCountdown ? focusDuration : 0);
  }, [clearTimer, isCountdown, focusDuration]);

  const skip = useCallback(() => {
    const wasIdle = mode === "idle";
    clearTimer();

    if (!isCountdown || wasIdle) {
      setIsRunning(false);
      setMode("idle");
      setSeconds(0);
      return;
    }

    setPhaseComplete(false);
    if (mode === "focus") {
      if (currentCycle < stateRef.current.totalCycles) {
        stateRef.current.onPhaseEnd?.("break");
        startCountdown(stateRef.current.breakDur, "break", currentCycle);
      } else {
        stateRef.current.onPhaseEnd?.("done");
        setIsRunning(false);
        setMode("idle");
        setSeconds(stateRef.current.focusDuration);
      }
    } else {
      stateRef.current.onPhaseEnd?.("focus");
      startCountdown(stateRef.current.focusDuration, "focus", currentCycle + 1);
    }
  }, [clearTimer, isCountdown, mode, currentCycle, startCountdown]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return {
    seconds,
    isRunning,
    mode,
    currentCycle,
    totalCycles,
    progress,
    phaseComplete,
    start,
    pause,
    resume,
    resumeFrom,
    continueNext,
    reset,
    skip,
  };
}
