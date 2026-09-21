import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { FilmStrip, LOOKS, type FilmStripShot } from "./index";

/**
 * `@storyboard/ui/film-strip`, as media-monster consumes it.
 *
 * DETERMINISTIC AND OFFLINE: every frame is one of the reference design's CSS
 * gradients, so nothing here fetches. Real posters are `url(…)` values in the
 * same slot and draw the same way.
 *
 * NO `play` FUNCTIONS. Panning, flinging and scrubbing are real-pointer
 * gestures, and a story that runs a play function on load is one the e2e suite
 * cannot drive (see CLAUDE.md).
 */
const meta: Meta<typeof FilmStrip> = {
  title: "film-strip/FilmStrip",
  component: FilmStrip,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof FilmStrip>;

const LIT = ["streetDay", "faceWarmC", "carCool", "storefront", "emberProfile", "duskWide"].map(
  (name) => LOOKS[name] ?? "",
);

const look = (index: number): string => LIT[index % LIT.length] ?? "";

function shot(
  index: number,
  seconds: number,
  sectionName: string | null,
  extra: Partial<FilmStripShot> = {},
): FilmStripShot {
  return {
    id: `s${index}`,
    label: `Shot ${index + 1} · ${seconds}s`,
    seconds,
    frames: [look(index)],
    sectionName,
    ...extra,
  };
}

const REEL: readonly FilmStripShot[] = [
  shot(0, 6, "Opening"),
  shot(1, 4.5, "Opening"),
  shot(2, 8, null),
  shot(3, 5, "Chase"),
  shot(4, 3, "Chase"),
  shot(5, 7, "Chase"),
];

/** The reference design's own sequence — what the strip draws with no data. */
export const Reference: Story = {};

/** A reel with two labelled sections and a loose shot between them. */
export const Sections: Story = { args: { shots: REEL } };

/** The subject drawn selected, and the strip centred on it. */
export const SelectedState: Story = { args: { shots: REEL, selectedId: "s3" } };

/**
 * Trim handles, on the SELECTED shot only, and only where a source window
 * exists. The ripple is live: releasing re-flows every shot after it.
 */
export const TrimHandles: Story = {
  render: function TrimHandlesStory() {
    const [shots, setShots] = useState<readonly FilmStripShot[]>(() =>
      REEL.map((s, i) => ({ ...s, sourceSeconds: s.seconds + 4, trimInSeconds: i === 0 ? 0 : 2 })),
    );
    return (
      <FilmStrip
        shots={shots}
        selectedId="s1"
        onTrim={(id, next) =>
          setShots((current) =>
            current.map((s) =>
              s.id === id ? { ...s, seconds: next.out - next.in, trimInSeconds: next.in } : s,
            ),
          )
        }
      />
    );
  },
};

/** No frames at all: the box keeps its width and its label, and paints nothing. */
export const MissingPoster: Story = {
  args: {
    shots: [shot(0, 5, "Opening"), shot(1, 6, "Opening", { frames: [] }), shot(2, 4, null)],
  },
};

/** One poster repeated across a long box, the way a still with no frame grabs fills it. */
export const RepeatedThumbnails: Story = {
  args: {
    shots: [
      shot(0, 4, null),
      shot(1, 16, null, { frames: Array.from({ length: 6 }, () => look(1)) }),
      shot(2, 4, null),
    ],
  },
};

/** A fraction of a second beside forty seconds — the box is its duration. */
export const ShortAndLongClips: Story = {
  args: {
    shots: [shot(0, 0.4, null), shot(1, 40, "Long take"), shot(2, 0.8, null), shot(3, 2, null)],
  },
};

/** Sixty shots across six sections: the ruler windows, the minimap carries the rest. */
export const ManyItems: Story = {
  args: {
    shots: Array.from({ length: 60 }, (_, i) =>
      shot(i, 2 + ((i * 7) % 9), `Scene ${Math.floor(i / 10) + 1}`),
    ),
  },
};
