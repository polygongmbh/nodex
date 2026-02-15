import { render, fireEvent } from "@testing-library/react";
import { useSwipeNavigation } from "./use-swipe-navigation";

function WheelHarness({
  onSwipeLeft,
  onSwipeRight,
  enableWheelSwipe = true,
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  enableWheelSwipe?: boolean;
}) {
  const handlers = useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
    enableWheelSwipe,
    threshold: 50,
    enableHaptics: false,
  });

  return <div data-testid="swipe-area" {...handlers} />;
}

describe("useSwipeNavigation wheel behavior", () => {
  it("triggers left swipe on horizontal trackpad gesture", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
    );

    fireEvent.wheel(getByTestId("swipe-area"), { deltaX: 60, deltaY: 8 });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("triggers right swipe on horizontal trackpad gesture", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
    );

    fireEvent.wheel(getByTestId("swipe-area"), { deltaX: -60, deltaY: 6 });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("does not trigger swipe for vertical scrolling", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
    );

    fireEvent.wheel(getByTestId("swipe-area"), { deltaX: 20, deltaY: 120 });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("does not trigger wheel swipe when disabled", () => {
    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} enableWheelSwipe={false} />
    );

    fireEvent.wheel(getByTestId("swipe-area"), { deltaX: 80, deltaY: 4 });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
