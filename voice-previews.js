// Native controls remain usable without JavaScript. Keep previews from overlapping.
export function setupVoicePreviews(root) {
  const players = [...root.querySelectorAll(".voice-audio")];
  for (const player of players) {
    const card = player.closest(".voice-card");
    const error = card.querySelector(".voice-error");
    player.addEventListener("play", () => {
      for (const other of players) if (other !== player) other.pause();
      error.hidden = true;
      card.classList.add("is-playing");
    });
    const clear = () => card.classList.remove("is-playing");
    player.addEventListener("pause", clear);
    player.addEventListener("ended", clear);
    player.addEventListener("error", () => {
      clear();
      error.hidden = false;
    });
  }
  return players;
}

if (typeof document !== "undefined") setupVoicePreviews(document);
