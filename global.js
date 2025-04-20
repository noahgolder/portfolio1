console.log("IT'S ALIVE!");

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// === Base path for links ===
const BASE_PATH = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/"
  : "/your-repo-name/"; // <-- replace with your GitHub Pages repo name

// === Pages for nav ===
const pages = [
  { url: 'index.html', title: 'Home' },
  { url: 'projects/index.html', title: 'Projects' },
  { url: 'resume.html', title: 'Resume' },
  { url: 'contact/index.html', title: 'Contact' },
  { url: 'https://github.com/noahgolder', title: 'GitHub' }, // external link
];

// === Create and add nav ===
const nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = !p.url.startsWith('http') ? BASE_PATH + p.url : p.url;
  let a = document.createElement('a');
  a.href = url;
  a.textContent = p.title;

  // Highlight current page
  a.classList.toggle('current', a.host === location.host && a.pathname === location.pathname);

  // Open external links in new tab
  a.target = a.host !== location.host ? '_blank' : '_self';

  nav.append(a);
}

// === Add dark mode switch ===
document.body.insertAdjacentHTML(
  'afterbegin',
  `
  <label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`
);

const select = document.querySelector('.color-scheme select');

function setColorScheme(scheme) {
  document.documentElement.style.setProperty('color-scheme', scheme);
  select.value = scheme;
  localStorage.colorScheme = scheme;
}

// Load saved preference
if ("colorScheme" in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

// Listen for changes
select.addEventListener('input', (event) => {
  setColorScheme(event.target.value);
});
