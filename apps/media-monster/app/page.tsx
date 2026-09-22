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
  return (
    // FULL WIDTH. The shell's <main> already pads the sides; a reel of video
    // cards wants every column the window can give it.
    // No bottom padding: the film strip is pinned to the bottom of the
    // viewport, and padding under it would make it rise when the page ends.
    <div className="pt-10">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">Toon Town</h1>
      <p className="mb-6 text-sm text-zinc-500">
        A fixture document, running on the nested-collections engine. Changes are
        undoable and are lost on reload.
      </p>
      <Board initialFilmStripSize={filmStripSize} initialBoardLayout={boardLayout} />
    </div>
  );
}
