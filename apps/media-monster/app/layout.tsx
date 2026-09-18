import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Grandstander } from "next/font/google";
import { Toaster } from "@/components/core/sonner";
import { Rail } from "@/components/shell/rail";
import {
  RAIL_EXPANDED_COOKIE,
  railExpandedFromValue,
} from "@/components/shell/rail-preference";
import {
  RAIL_OPEN_WIDTH_PX,
  RAIL_WIDTH_VAR,
  RAIL_WIDTH_PX,
} from "@/components/shell/rail-width";
import "./globals.css";

/**
 * The wordmark's face, and the only custom font here — everything else rides
 * Tailwind's `font-sans`.
 *
 * Exposed as a VARIABLE rather than applied to the body: it is a display face
 * for one lockup, not a UI font.
 *
 * LOADING A WEIGHT IS NOT ASKING FOR IT. `next/font` emits one `@font-face` at
 * the weight named here; the ELEMENT still renders at whatever `font-weight`
 * cascades to it, which is 400 by default. With a single face available the
 * browser will use it either way, but it is then drawing a 700 face for a 400
 * request and free to synthesise — so the lockup carries `font-bold` to ask for
 * the weight that was loaded. Both numbers move together or neither does.
 */
const grandstander = Grandstander({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-grandstander",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Media Monster",
  description:
    "Herd AI-generated clips into collections, nested as deep as you like, until the pile turns into a cut.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /**
   * `dark` is what switches on every `dark:` utility. The variant is rebound to
   * this class in globals.css precisely so the app stops following the reader's
   * OS theme — see the note there for what that cost the source app when a
   * light-mode machine rendered white-on-near-black buttons nobody else could
   * see.
   *
   * ASYNC NOW, AND ONLY BECAUSE OF THE RAIL. It was sync while there was
   * nothing to await, on the grounds that an empty `async` layout buys a dynamic
   * render for nothing. The rail's width is the first thing that has to be known
   * before the first byte: read it after paint and everything beside the rail
   * starts 168px out of place and jumps. A dynamic render is what correctness
   * costs here, and it is the trade the source app made for the same reason.
   */
  const railExpanded = railExpandedFromValue(
    (await cookies()).get(RAIL_EXPANDED_COOKIE)?.value,
  );

  return (
    <html
      lang="en"
      className={`dark ${grandstander.variable}`}
      /**
       * THE RAIL'S WIDTH, PUBLISHED BEFORE ANYTHING PAINTS.
       *
       * Written from the COOKIE, so the server's own markup is already the right
       * width and hydration has nothing to correct. In the source app the
       * preference lived only in `localStorage`, which the server cannot read,
       * so the rail rendered collapsed and widened on hydration — shoving `main`
       * 188px sideways for 0.135 of a 0.16 cumulative layout shift.
       *
       * A variable rather than a literal because the READERS are the point:
       * surfaces beside the rail offset themselves by this, and they keep
       * working when the number moves. The rail writes it again on every toggle,
       * which the server will not hear about until the next request.
       */
      style={
        {
          [RAIL_WIDTH_VAR]: `${
            railExpanded ? RAIL_OPEN_WIDTH_PX : RAIL_WIDTH_PX
          }px`,
        } as React.CSSProperties
      }
    >
      <body suppressHydrationWarning>
        {/* App-wide, because anything that toasts will live outside a single
            view — the same reason it sits here in the source app. */}
        <Toaster />
        <div className="relative flex min-h-screen overflow-x-clip bg-zinc-950 font-sans text-white">
          {/* THE RAIL FILLS THE SLOT THE PLACEHOLDER HELD. It is `shrink-0` and
              carries its own width, so `main` — its `flex-1` sibling — is
              offset by exactly what the variable above already reserved. The
              placeholder existed so this substitution would move nothing: in
              the source app a rail arriving into an unreserved layout shifted
              `main` from x:0 w:1385 to x:260 w:1125, which measured 0.1837 and
              was the entire cumulative layout shift of the page.

              It renders from the SERVER'S reading of the cookie, so the first
              paint is already the right width and hydration has nothing to
              correct. */}
          <Rail initialRailExpanded={railExpanded} />
          <main className="min-w-0 flex-1 px-8 pt-[13px]">{children}</main>
        </div>
      </body>
    </html>
  );
}
