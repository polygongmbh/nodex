import { render, fireEvent } from "@testing-library/react";
import { useSwipeNavigation } from "./use-swipe-navigation";

function setHorizontalScrollMetrics(element: HTMLElement, {
  clientWidth,
  scrollWidth,
  scrollLeft,
}: {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}) {
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(element, "scrollLeft", {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
}

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

function TouchHarness({
  onSwipeLeft,
  onSwipeRight,
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const handlers = useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
    threshold: 50,
    enableHaptics: false,
  });

  return (
    <div data-testid="swipe-area" {...handlers}>
      <div data-testid="touch-target">content</div>
    </div>
  );
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

  it("does not trigger swipe when a horizontal scroller can consume the wheel gesture", () => {
    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} />
    );
    const swipeArea = getByTestId("swipe-area");

    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    setHorizontalScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 300,
      scrollLeft: 40,
    });

    const content = document.createElement("div");
    scroller.appendChild(content);
    swipeArea.appendChild(scroller);

    fireEvent.wheel(content, { deltaX: 60, deltaY: 4 });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("does not trigger swipe when the wheel burst starts inside a horizontal scroller at the boundary", () => {
    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} />
    );
    const swipeArea = getByTestId("swipe-area");

    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    setHorizontalScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 300,
      scrollLeft: 200,
    });

    const content = document.createElement("div");
    scroller.appendChild(content);
    swipeArea.appendChild(scroller);

    fireEvent.wheel(content, { deltaX: 60, deltaY: 4 });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("only triggers one swipe for a single long wheel gesture burst", () => {
    vi.useFakeTimers();
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(360);

    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} />
    );
    const swipeArea = getByTestId("swipe-area");

    fireEvent.wheel(swipeArea, { deltaX: 20, deltaY: 2 });
    fireEvent.wheel(swipeArea, { deltaX: 20, deltaY: 2 });
    fireEvent.wheel(swipeArea, { deltaX: 20, deltaY: 2 });
    fireEvent.wheel(swipeArea, { deltaX: 60, deltaY: 2 });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);

    dateNowSpy.mockRestore();
    vi.useRealTimers();
  });

  it("does not navigate when a wheel burst starts in a scroller and later reaches the parent", () => {
    vi.useFakeTimers();
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(180)
      .mockReturnValueOnce(260);

    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(
      <WheelHarness onSwipeLeft={onSwipeLeft} />
    );
    const swipeArea = getByTestId("swipe-area");

    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    setHorizontalScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 300,
      scrollLeft: 200,
    });

    const content = document.createElement("div");
    scroller.appendChild(content);
    swipeArea.appendChild(scroller);

    fireEvent.wheel(content, { deltaX: 20, deltaY: 2 });
    fireEvent.wheel(content, { deltaX: 20, deltaY: 2 });
    fireEvent.wheel(content, { deltaX: 20, deltaY: 2 });
    fireEvent.wheel(swipeArea, { deltaX: 60, deltaY: 2 });

    expect(onSwipeLeft).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe("useSwipeNavigation touch behavior", () => {
  it("does not trigger swipe when touch starts inside a horizontal scroller", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { getByTestId } = render(
      <TouchHarness onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
    );
    const swipeArea = getByTestId("swipe-area");

    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    setHorizontalScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 300,
      scrollLeft: 40,
    });

    const content = document.createElement("div");
    scroller.appendChild(content);
    swipeArea.appendChild(scroller);

    fireEvent.touchStart(content, {
      targetTouches: [{ clientX: 180, clientY: 20 }],
      touches: [{ clientX: 180, clientY: 20 }],
    });
    fireEvent.touchMove(content, {
      targetTouches: [{ clientX: 100, clientY: 24 }],
      touches: [{ clientX: 100, clientY: 24 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 100, clientY: 24 }],
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("does not trigger swipe after the same touch gesture first consumes horizontal scroll", () => {
    const onSwipeLeft = vi.fn();
    const { getByTestId } = render(
      <TouchHarness onSwipeLeft={onSwipeLeft} />
    );
    const swipeArea = getByTestId("swipe-area");

    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    setHorizontalScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 300,
      scrollLeft: 160,
    });

    const content = document.createElement("div");
    scroller.appendChild(content);
    swipeArea.appendChild(scroller);

    fireEvent.touchStart(content, {
      targetTouches: [{ clientX: 220, clientY: 20 }],
      touches: [{ clientX: 220, clientY: 20 }],
    });

    scroller.scrollLeft = 200;

    fireEvent.touchMove(content, {
      targetTouches: [{ clientX: 120, clientY: 24 }],
      touches: [{ clientX: 120, clientY: 24 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 40, clientY: 28 }],
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("still triggers swipe when touch starts outside a horizontal scroller", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { getByTestId } = render(
      <TouchHarness onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
    );
    const swipeArea = getByTestId("swipe-area");

    fireEvent.touchStart(swipeArea, {
      targetTouches: [{ clientX: 180, clientY: 20 }],
      touches: [{ clientX: 180, clientY: 20 }],
    });
    fireEvent.touchMove(swipeArea, {
      targetTouches: [{ clientX: 100, clientY: 24 }],
      touches: [{ clientX: 100, clientY: 24 }],
    });
    fireEvent.touchEnd(swipeArea, {
      changedTouches: [{ clientX: 100, clientY: 24 }],
    });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
