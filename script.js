const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");
const savedTheme = localStorage.getItem("theme");

if (savedTheme) {
  root.dataset.theme = savedTheme;
}

toggle.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "night" ? "" : "night";

  if (nextTheme) {
    root.dataset.theme = nextTheme;
    localStorage.setItem("theme", nextTheme);
  } else {
    delete root.dataset.theme;
    localStorage.removeItem("theme");
  }
});
