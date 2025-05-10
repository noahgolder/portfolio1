import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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
  });
}

function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Additional Stats
  dl.append('dt').text('Number of files');
  dl.append('dd').text(d3.groups(data, d => d.file).length);

  dl.append('dt').text('Average file length');
  const fileLengths = d3.rollups(data, v => d3.max(v, d => d.line), d => d.file);
  dl.append('dd').text(d3.mean(fileLengths, d => d[1]).toFixed(2));

  dl.append('dt').text('Maximum depth');
  dl.append('dd').text(d3.max(data, d => d.depth));

  dl.append('dt').text('Average depth');
  dl.append('dd').text(d3.mean(data, d => d.depth).toFixed(2));
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
  const xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);

  const rScale = d3
    .scaleSqrt() // Square root scale for area perception
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
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // Dots
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(sortedCommits)
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

let data = await loadData();
let commits = processCommits(data);

renderScatterPlot(data, commits);
renderCommitInfo(data, commits);
