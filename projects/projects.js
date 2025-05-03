import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Load project data
let projects = await fetchJSON('../lib/projects.json');

// DOM Elements
const projectsContainer = document.querySelector('.projects');
const titleElement = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');

// Initial Render
renderProjects(projects, projectsContainer, 'h2');
if (titleElement && Array.isArray(projects)) {
  titleElement.textContent += ` (${projects.length})`;
}

let query = '';
let selectedIndex = -1;

// Main pie/legend render function
function renderPieChart(projectsGiven) {
  const svg = d3.select('svg');
  svg.selectAll('path').remove();

  const legend = d3.select('.legend');
  legend.selectAll('li').remove();

  // Group and sort data by year
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year
  ).sort(([aYear], [bYear]) => aYear - bYear);

  let data = rolledData.map(([year, count]) => ({
    label: year,
    value: count
  }));

  const colors = d3.scaleOrdinal(d3.schemeTableau10);

  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(data);

  const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

  arcData.forEach((d, i) => {
    svg.append('path')
      .attr('d', arcGenerator(d))
      .attr('fill', colors(i))
      .attr('class', selectedIndex === i ? 'selected' : '')
      .on('click', () => {
        selectedIndex = selectedIndex === i ? -1 : i;

        svg.selectAll('path')
          .attr('class', (_, idx) => (selectedIndex === idx ? 'selected' : ''));

          legend.selectAll('li')
          .attr('class', (_, idx) => `legend-item ${selectedIndex === idx ? 'selected' : ''}`);
        

        if (selectedIndex === -1) {
          const sortedAll = [...projectsGiven].sort((a, b) => (a.year || 0) - (b.year || 0));
          renderProjects(sortedAll, projectsContainer, 'h2');
        } else {
          const year = data[selectedIndex].label;
          const filtered = projectsGiven
            .filter((p) => p.year === year)
            .sort((a, b) => a.title.localeCompare(b.title));
          renderProjects(filtered, projectsContainer, 'h2');
        }
      });
  });

  // Create legend
  data.forEach((d, i) => {
    legend.append('li')
      .attr('style', `--color:${colors(i)}`)
      .attr('class', `legend-item ${selectedIndex === i ? 'selected' : ''}`)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => {
        selectedIndex = selectedIndex === i ? -1 : i;

        svg.selectAll('path')
          .attr('class', (_, idx) => (selectedIndex === idx ? 'selected' : ''));

        legend.selectAll('li')
          .attr('class', (_, idx) => `legend-item ${selectedIndex === idx ? 'selected' : ''}`);

        if (selectedIndex === -1) {
          const sortedAll = [...projectsGiven].sort((a, b) => (a.year || 0) - (b.year || 0));
          renderProjects(sortedAll, projectsContainer, 'h2');
        } else {
          const year = d.label;
          const filtered = projectsGiven
            .filter((p) => p.year === year)
            .sort((a, b) => a.title.localeCompare(b.title));
          renderProjects(filtered, projectsContainer, 'h2');
        }
      });
  });
}

// Initial chart render
renderPieChart(projects);

// Search input logic
searchInput.addEventListener('input', (event) => {
  query = event.target.value.toLowerCase();

  const filteredProjects = projects.filter((project) => {
    const values = Object.values(project).join(' ').toLowerCase();
    return values.includes(query);
  });

  selectedIndex = -1;

  // Sort filtered results by year
  const sorted = [...filteredProjects].sort((a, b) => (a.year || 0) - (b.year || 0));

  renderProjects(sorted, projectsContainer, 'h2');
  renderPieChart(filteredProjects);
});
