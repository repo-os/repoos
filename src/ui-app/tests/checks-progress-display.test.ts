import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChecksProgressDisplay from "../src/components/ChecksProgressDisplay.vue";

describe("ChecksProgressDisplay", () => {
  const progress = {
    stepsDone: 1,
    stepsTotal: 100,
    testsDone: null,
    testsTotal: null,
  };

  it("renders a rounded track with a minimum visible fill at 1%", () => {
    const wrapper = mount(ChecksProgressDisplay, {
      props: {
        variant: "card",
        progress: { ...progress, stepsDone: 1, stepsTotal: 100 },
      },
    });
    const fill = wrapper.find(".check-progress-meter__fill");
    expect(fill.exists()).toBe(true);
    expect(fill.attributes("style")).toContain("width: 2%");
    expect(wrapper.find(".check-progress-meter__track").exists()).toBe(true);
  });

  it("lays out drawer bar and detail on one row at half width", () => {
    const wrapper = mount(ChecksProgressDisplay, {
      props: {
        variant: "drawer",
        progress: {
          stepsDone: 4,
          stepsTotal: 8,
          currentStep: 4,
          testsDone: 24,
          testsTotal: 72,
        },
      },
    });
    const row = wrapper.find('[data-test-id="checks-progress-drawer-bar-row"]');
    expect(row.find(".checks-progress-meter--half").exists()).toBe(true);
    expect(row.find(".checks-progress-drawer-detail").text()).toContain("tests 24/72 files");
  });

  it("puts pipeline status text beside the bar", () => {
    const wrapper = mount(ChecksProgressDisplay, {
      props: {
        variant: "pipeline",
        pipelineStatusText: "Running checks 3/680",
        progress: {
          stepsDone: 3,
          stepsTotal: 9,
          testsDone: 3,
          testsTotal: 680,
          stepName: "tests",
        },
      },
    });
    const row = wrapper.find(".checks-progress-pipeline-row");
    expect(row.find(".checks-progress-pipeline-status").text()).toBe("Running checks 3/680");
    expect(row.find("progress").exists()).toBe(true);
  });
});
