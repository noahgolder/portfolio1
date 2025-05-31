import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// Global variables
let commits;
let data;
let filteredCommits;
let xScale;
let yScale;
let commitProgress = 100;
let colors = d3.scaleOrdinal(d3.schemeTableau10);
let timeScale;

console.log('main.js loaded');

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: +row.line,
    depth: +row.depth,
    length: +row.length,
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  return data;
}

function processCommits(data) {
  return d3.groups(data, d => d.commit).map(([commit, lines]) => {
    const first = lines[0];
    const { author, date, time, timezone, datetime } = first;

    const ret = {
      id: commit,
      url: 'https://github.com/noahgolder/portfolio1/commit/' + commit,
      author,
      date,
      time,
      timezone,
      datetime,
      hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
      totalLines: lines.length,
    };

    Object.defineProperty(ret, 'lines', {
      value: lines,
      enumerable: false,
      writable: false,
      configurable: false,
    });

    return ret;
  }).sort((a, b) => d3.ascending(a.datetime, b.datetime)); // Sort commits by datetime
}

function renderCommitInfo(data, commits) {
  // Clear existing stats
  d3.select('#stats').html('');
  
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  // Add stats in the order shown in the reference
  dl.append('dt').text('COMMITS');
  dl.append('dd').text(commits.length);

  dl.append('dt').text('FILES');
  dl.append('dd').text(d3.groups(data, d => d.file).length);

  dl.append('dt').text('TOTAL LOC');
  dl.append('dd').text(data.length);

  dl.append('dt').text('MAX DEPTH');
  dl.append('dd').text(d3.max(data, d => d.depth));

  dl.append('dt').text('LONGEST LINE');
  dl.append('dd').text(d3.max(data, d => d.length));

  dl.append('dt').text('MAX LINES');
  dl.append('dd').text(d3.max(d3.rollups(data, v => d3.max(v, d => d.line), d => d.file), d => d[1]));
}

function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // Create SVG
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // Scales
  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);

  const rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([2, 30]);

  // Gridlines
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  // Dots
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', (d) => (d.hourFrac >= 6 && d.hourFrac <= 18 ? 'orange' : 'steelblue'))
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  // Create brush
  createBrushSelector(svg, xScale, yScale);

  // Raise dots above the overlay
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// Rendering the language breakdown:
function renderLanguageBreakdown(selection, xScale, yScale) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d, xScale, yScale))
    : [];

  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  // Use d3.rollup to count lines per language
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  // Update DOM with breakdown
  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
            <dt>${language}</dt>
            <dd>${count} lines (${formatted})</dd>
        `;
  }
}

function isCommitSelected(selection, commit, xScale, yScale) {
  if (!selection) return false;

  // Get the x and y positions of the commit
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  // Check if the commit is within the selected area
  const [[x0, y0], [x1, y1]] = selection;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Rendering the selected commit count:
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d, xScale, yScale))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

  return selectedCommits;
}

function createBrushSelector(svg, xScale, yScale) {
  const brush = d3.brush()
    .on('start brush end', (event) => brushed(event, xScale, yScale));

  svg.call(brush);
}

function brushed(event, xScale, yScale) {
  const selection = event.selection;

  // Update the selection for circles (highlighting them)
  d3.selectAll('circle').classed('selected', (d) => isCommitSelected(selection, d, xScale, yScale));

  // Render the number of selected commits
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection, xScale, yScale);
}

function updateFileDisplay(commits) {
  let lines = commits.flatMap((d) => d.lines);
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').call(dt => {
            dt.append('code');
            dt.append('small');
          });
          div.append('dd');
        }),
    );

  // Update filename and line count
  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer.select('dt > small').html((d) => `<br>${d.lines.length} lines`);

  // Create unit visualization dots with colors
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

function onTimeSliderChange() {
  commitProgress = +document.getElementById('commit-progress').value;
  let commitMaxTime = timeScale.invert(commitProgress);
  document.getElementById('commit-time').textContent = commitMaxTime.toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short"
  });
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  updateScatterPlot(data, filteredCommits);
  renderCommitInfo(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function updateScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').select('svg');

  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const xAxis = d3.axisBottom(xScale);

  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);

  const dots = svg.select('g.dots');

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', (d) => (d.hourFrac >= 6 && d.hourFrac <= 18 ? 'orange' : 'steelblue'))
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

function onStepEnter(response) {
  const commit = response.element.__data__;
  const commitDate = commit.datetime;
  
  // Update filtered commits
  filteredCommits = commits.filter((d) => d.datetime <= commitDate);
  
  // Update visualizations
  updateScatterPlot(data, filteredCommits);
  renderCommitInfo(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

// Initialize everything
async function initialize() {
  // Load and process data
  data = await loadData();
  commits = processCommits(data);
  filteredCommits = commits;

  // Initialize time scale
  timeScale = d3
    .scaleTime()
    .domain([
      d3.min(commits, (d) => d.datetime),
      d3.max(commits, (d) => d.datetime),
    ])
    .range([0, 100]);

  // Render initial visualizations
  renderScatterPlot(data, commits);
  renderCommitInfo(data, commits);
  updateFileDisplay(commits);

  // Generate commit story text for both sections
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html(
      (d, i) => `
      On ${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })},
      I made <a href="${d.url}" target="_blank">${
        i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
      }</a>.
      I edited ${d.totalLines} lines across ${
        d3.rollups(
          d.lines,
          (D) => D.length,
          (d) => d.file,
        ).length
      } files.
      Then I looked over all I had made, and I saw that it was very good.
    `);

  // Generate file evolution story
  d3.select('#files-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html(
      (d, i) => `
      On ${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })},
      I made <a href="${d.url}" target="_blank">${
        i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
      }</a>.
      I edited ${d.totalLines} lines across ${
        d3.rollups(
          d.lines,
          (D) => D.length,
          (d) => d.file,
        ).length
      } files.
      Then I looked over all I had made, and I saw that it was very good.
    `);

  // Initialize both Scrollama instances
  const scroller1 = scrollama();
  scroller1
    .setup({
      container: '#scrolly-1',
      step: '#scrolly-1 .step',
      offset: 0.5,
    })
    .onStepEnter(onStepEnter);

  const scroller2 = scrollama();
  scroller2
    .setup({
      container: '#scrolly-2',
      step: '#scrolly-2 .step',
      offset: 0.5,
    })
    .onStepEnter(onStepEnter);

  // Initialize the time slider
  document.getElementById('commit-progress').addEventListener('input', onTimeSliderChange);
  onTimeSliderChange();
}

// Start the application
initialize().catch(console.error);
