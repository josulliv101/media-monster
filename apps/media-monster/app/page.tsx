import { Board } from "@/components/board/board";

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
export default function Home() {
  return (
    // FULL WIDTH. The shell's <main> already pads the sides; a reel of video
    // cards wants every column the window can give it.
    <div className="py-10">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">Toon Town</h1>
      <p className="mb-6 text-sm text-zinc-500">
        A fixture document, running on the nested-collections engine. Changes are
        undoable and are lost on reload.
      </p>
      <Board />
    </div>
  );
}
