// Keep third-party puzzle pages out of the game WebView. Android back must
// return to the same live puzzle, not navigate the app to a remote document.
export function externalSourceUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function installExternalLinkHandler({root, native, openNative, openWeb, save, notify}) {
  root.addEventListener('click', event => {
    if (event.defaultPrevented || event.button > 0) return;
    const link = event.target?.closest?.('a[href]');
    if (!link || !root.contains(link)) return;
    const url = externalSourceUrl(link.href);
    if (!url) return;
    event.preventDefault();
    // Flush any pending debounce before Android pauses or reclaims the app.
    save();
    try {
      if (native) {
        // Never fall back to location.href on Android: that replaces the puzzle.
        Promise.resolve(openNative(url)).catch(notify);
      } else {
        openWeb(url); // synchronous user gesture; separate browser tab
      }
    } catch (error) {
      notify(error);
    }
  }, true);
}
