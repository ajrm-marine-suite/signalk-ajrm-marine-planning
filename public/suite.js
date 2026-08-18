/** Switches between the two consolidated planning views without reloading Signal K. */
const frame = document.getElementById("planner");
for (const button of document.querySelectorAll("button[data-view]")) {
  button.addEventListener("click", () => {
    for (const item of document.querySelectorAll("button[data-view]")) item.classList.toggle("active", item === button);
    const name = button.dataset.view === "anchor" ? "Anchor Force" : "Gate Passage";
    frame.title = `${name} Planner`;
    frame.src = `${button.dataset.view}/index.html?v=0.5.10`;
  });
}
