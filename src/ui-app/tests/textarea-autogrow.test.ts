import { describe, expect, it } from "vitest";
import { autoGrowTextarea } from "../src/utils/textarea-autogrow";

function mockTextarea(naturalHeight: number) {
  const style = { height: "" };
  let heightDuringMeasurement = "";
  const textarea = {
    style,
    get scrollHeight() {
      heightDuringMeasurement = style.height;
      return naturalHeight;
    },
  } as HTMLTextAreaElement;
  return {
    textarea,
    measuredAt: () => heightDuringMeasurement,
    setNaturalHeight: (height: number) => {
      naturalHeight = height;
    },
  };
}

describe("autoGrowTextarea", () => {
  it("resets before measuring and shrinks when the content gets shorter", () => {
    const { textarea, measuredAt, setNaturalHeight } = mockTextarea(360);
    textarea.style.height = "420px";

    autoGrowTextarea(textarea, 420);
    expect(measuredAt()).toBe("auto");
    expect(textarea.style.height).toBe("360px");

    setNaturalHeight(180);
    autoGrowTextarea(textarea, 420);
    expect(measuredAt()).toBe("auto");
    expect(textarea.style.height).toBe("180px");
  });

  it("clamps the height to the configured maximum", () => {
    const { textarea } = mockTextarea(600);

    autoGrowTextarea(textarea, 420);

    expect(textarea.style.height).toBe("420px");
  });
});
