import { cookies } from "next/headers";

import { Board } from "@/components/board/board";
import {
  FILM_STRIP_SIZE_COOKIE,
  filmStripSizeFromValue,
} from "@/components/settings/film-strip-size-preference";
import {
  BOARD_LAYOUT_COOKIE,
  boardLayoutFromValue,
} from "@/components/settings/board-layout-preference";
import {
  INACTIVE_ROWS_COOKIE,
  inactiveRowsFromValue,
} from "@/components/settings/inactive-rows-preference";

/**
 * The first real view.
 *
 * It replaces the shell's placeholder, which had done its job: it proved the
 * monster rendered, the font loaded, the dark palette painted and the toast
 * surface was mounted. Its "Test the toaster" button went with it — the only
 * check that the surface existed, and worth nothing once a view with real
 * controls sits here.
 *
 * A SERVER COMPONENT holding a client one. Nothing on this page needs the
 * client until the engine does, and the engine's core is deliberately callable
 * from the server — so when documents start arriving from storage, the fetch
 * belongs here and only the board below it has to stay a client boundary.
 */
export default async function Home() {
  // Read here so the strip renders at its chosen size in the first byte. The
  // layout already reads a cookie, so this adds no dynamic render of its own.
  const jar = await cookies();
  const filmStripSize = filmStripSizeFromValue(jar.get(FILM_STRIP_SIZE_COOKIE)?.value);
  const boardLayout = boardLayoutFromValue(jar.get(BOARD_LAYOUT_COOKIE)?.value);
  const inactiveRows = inactiveRowsFromValue(jar.get(INACTIVE_ROWS_COOKIE)?.value);
  return (
    // FULL WIDTH. The shell's <main> already pads the sides; a reel of video
    // cards wants every column the window can give it.
    // No bottom padding: the film strip is pinned to the bottom of the
    // viewport, and padding under it would make it rise when the page ends.
    // A COLUMN THAT FILLS THE SCREEN, so the board's film strip can sit at the
    // bottom of the viewport even when the board above it is short (every
    // collection closed). `main` is the column above this; the board ends in a
    // spacer that takes up whatever height is left.
    //
    // NO HEADING HERE: the board's own top bar carries the title, read from the
    // document, beside undo and redo.
    //
    // `md:pt-[13px]` LINES THAT BAR UP WITH THE MONSTER in the rail: with
    // `main`'s own 13px above it, the bar's title and buttons centre on the
    // same line as the creature. Measured, not reasoned: at 16px they sat 3px
    // low. On a phone the rail is a drawer, so there is nothing to line up with.
    <div className="flex flex-1 flex-col pt-4 md:pt-[13px]">
      <Board
        initialFilmStripSize={filmStripSize}
        initialBoardLayout={boardLayout}
        initialInactiveRows={inactiveRows}
      />
    </div>
  );
}
