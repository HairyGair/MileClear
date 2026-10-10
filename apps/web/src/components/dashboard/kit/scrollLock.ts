// Stop the page scrolling behind a dialog. Keep the scrollbar's strip only if
// the page really had a scrollbar, so the page does not jump sideways. On a
// short page (no scrollbar) reserving the strip would push dialogs off centre
// and nudge the page on Windows and Linux.
export function lockScroll() {
  const html = document.documentElement;
  html.classList.toggle("mc-scroll-lock--gutter", window.innerWidth > html.clientWidth);
  html.classList.add("mc-scroll-lock");
}

export function unlockScroll() {
  document.documentElement.classList.remove("mc-scroll-lock", "mc-scroll-lock--gutter");
}
